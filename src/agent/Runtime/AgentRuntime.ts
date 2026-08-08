// AgentRuntime.ts
import type { HumanInteraction } from '@agent/Human/HumanInteraction';
import type { PlanGenerator } from '@agent/Planning/PlanGenerator';
import type { PlanUpdater } from '@agent/Planning/PlanUpdater';
import type { RecoveryController, RecoveryDecision } from '@agent/Planning/RecoveryController';
import type { TaskPlan } from '@agent/Planning/TaskPlan';
import type { ExecutionReporter } from '@agent/Reporting/ExecutionReporter';
import type { ChangeExecutor } from '@agent/Execution/ChangeExecutor';
import type { ToolExecutor } from '@agent/Execution/ToolExecutor';
import type { AgentConfiguration } from '@core/Configuration/Configuration';
import type { Conversation } from '@core/Conversation/Conversation';
import { Execution } from '@core/Execution/Execution';
import type { Logger } from '@core/Logging/Logger';
import type { Task } from '@core/Task/Task';
import type { ModelController } from '@model/Controller/ModelController';
import type { OperationResult, TaskIntent } from '@model/Result/OperationResult';
import type { OperationProfile } from '@operation/Profile/OperationProfile';
import type { OperationRegistry } from '@operation/Registry/OperationRegistry';

interface RuntimeState {
  task: Task;
  conversation: Conversation;
  execution: Execution;
  taskPlan: TaskPlan;
  startedAt: number;
  planIndex: number;
  planStepAttempts: number;
  taskIntent: TaskIntent;
  searchAttempts: number;
  understandToolBatches: number;
  recoveryAttempts: Map<string, number>;
  resumes: number;
  pauseReason?: string;
}

export class AgentRuntime {
  private static readonly MAX_SEARCH_ATTEMPTS = 3;
  private static readonly MAX_UNDERSTAND_TOOL_BATCHES = 2;
  private static readonly MAX_UNDERSTAND_TOOLS_PER_BATCH = 3;
  private static readonly MAX_RESUMES = 3;
  private static readonly MIN_SAFETY_STEPS = 20;

  private readonly pausedByConversation = new Map<string, RuntimeState>();

  public constructor(
    private readonly configuration: AgentConfiguration,
    private readonly operationRegistry: OperationRegistry,
    private readonly modelController: ModelController,
    private readonly toolExecutor: ToolExecutor,
    private readonly changeExecutor: ChangeExecutor,
    private readonly human: HumanInteraction,
    private readonly logger: Logger,
    private readonly reporter: ExecutionReporter,
    private readonly planGenerator: PlanGenerator,
    private readonly recoveryController: RecoveryController,
    private readonly planUpdater: PlanUpdater,
  ) {}

  public hasPausedExecution(conversationId: string): boolean {
    return this.pausedByConversation.has(conversationId);
  }

  public cancelPaused(conversationId: string): boolean {
    const state = this.pausedByConversation.get(conversationId);
    if (!state) return false;
    state.execution.status = 'cancelled';
    state.execution.result = 'Execution cancelled by user';
    state.execution.addEvent('execution-cancelled', { reason: 'user' });
    this.pausedByConversation.delete(conversationId);
    return true;
  }

  public async execute(task: Task, conversation: Conversation): Promise<Execution> {
    const execution = new Execution(task.id);
    execution.status = 'running';
    execution.addEvent('task', { description: task.description });

    this.reporter.task(task.description);
    const taskPlan = await this.planGenerator.generate(task, execution.id);
    execution.addEvent('task-plan', taskPlan);
    this.reporter.plan(taskPlan);
    execution.currentOperation = task.options?.initialOperation ?? taskPlan.steps[0]?.type ?? 'understand';

    const state: RuntimeState = {
      task,
      conversation,
      execution,
      taskPlan,
      startedAt: Date.now(),
      planIndex: 0,
      planStepAttempts: 0,
      taskIntent: this.inferTaskIntent(task.description),
      searchAttempts: 0,
      understandToolBatches: 0,
      recoveryAttempts: new Map(),
      resumes: 0,
    };

    await this.logger.info('execution-started', { operation: execution.currentOperation }, this.logContext(task, execution));
    return this.run(state);
  }

  public async resume(conversationId: string, humanHint?: string): Promise<Execution | undefined> {
    const state = this.pausedByConversation.get(conversationId);
    if (!state) return undefined;

    if (state.resumes >= AgentRuntime.MAX_RESUMES) {
      state.execution.status = 'failed';
      state.execution.result = `Execution resume limit exceeded (${AgentRuntime.MAX_RESUMES})`;
      this.pausedByConversation.delete(conversationId);
      return this.finish(state);
    }

    state.resumes += 1;
    state.execution.status = 'running';
    state.execution.addEvent('execution-resumed', { resume: state.resumes, humanHint });
    if (humanHint?.trim()) state.execution.addEvent('human-hint', { hint: humanHint.trim() });
    this.reporter.resumed(state.resumes, humanHint);
    await this.logger.info('execution-resumed', { resume: state.resumes, humanHint }, this.logContext(state.task, state.execution));

    if (state.pauseReason?.startsWith('step:')) {
      if (humanHint?.trim()) {
        const recovered = await this.recoverCurrentStep(state, 'human-resume-with-hint', humanHint);
        if (!recovered || state.execution.status !== 'running') return this.finishOrPause(state);
      } else {
        const current = state.taskPlan.steps[state.planIndex];
        if (current) {
          current.status = 'pending';
          state.planStepAttempts = 0;
          state.execution.currentOperation = current.type;
          state.recoveryAttempts.set(current.id, 0);
          state.execution.addEvent('plan-step-retry-authorized', { stepId: current.id, source: 'human-continue' });
        }
      }
    }

    state.pauseReason = undefined;
    this.pausedByConversation.delete(conversationId);
    return this.run(state);
  }

  private async run(state: RuntimeState): Promise<Execution> {
    const { task, conversation, execution, taskPlan } = state;
    const context = this.logContext(task, execution);
    const safetyMaxSteps = Math.max(this.configuration.maxSteps, AgentRuntime.MIN_SAFETY_STEPS);
    let stepsThisRun = 0;

    while (execution.status === 'running' && stepsThisRun < safetyMaxSteps) {
      stepsThisRun += 1;
      execution.currentStep += 1;
      const step = execution.currentStep;

      const requestedOperation = execution.currentOperation ?? taskPlan.steps[state.planIndex]?.type ?? 'understand';
      const futurePlanIndex = taskPlan.steps.findIndex((planStep, index) => index >= state.planIndex && planStep.type === requestedOperation);
      if (futurePlanIndex > state.planIndex) {
        taskPlan.steps[state.planIndex].status = 'completed';
        state.planIndex = futurePlanIndex;
        state.planStepAttempts = 0;
      }

      const activePlanStep = taskPlan.steps[state.planIndex];
      if (activePlanStep && requestedOperation === activePlanStep.type) {
        if (state.planStepAttempts >= activePlanStep.maxAttempts) {
          const recovered = await this.recoverCurrentStep(state, 'step-attempt-budget');
          if (!recovered || execution.status !== 'running') break;
          continue;
        }
        activePlanStep.status = 'running';
        state.planStepAttempts += 1;
      }

      const operation = await this.resolveOperation(execution.currentOperation ?? 'understand', task, execution);
      if (!operation) {
        execution.status = 'failed';
        execution.result = `No available operation for ${execution.currentOperation ?? 'unknown'}`;
        break;
      }

      execution.currentOperation = operation.id;
      if (operation.id === 'search') state.searchAttempts += 1;
      execution.addEvent('operation-started', { step, operation: operation.id });
      await this.logger.info('operation-selected', { step, operation: operation.id }, context);
      this.reporter.step(step, operation.id);

      if (operation.id === 'verify') await this.logger.info('verification-started', { step }, context);

      let result: OperationResult;
      try {
        result = await this.modelController.execute({ task, execution, conversation, operation });
      } catch (error) {
        execution.addEvent('model-error', { operation: operation.id, error: String(error) });
        await this.logger.error('model-error', { operation: operation.id, error: String(error) }, context);
        const recovered = await this.recoverCurrentStep(state, `model-error: ${String(error)}`);
        if (recovered) continue;
        break;
      }

      this.reporter.note(operation.id, result.message);
      execution.addEvent('operation-result', {
        operation: operation.id,
        status: result.status,
        message: result.message,
        observations: result.observations,
      });

      if (operation.id === 'plan' && result.intent) {
        state.taskIntent = result.intent;
        await this.logger.info('task-intent-classified', { intent: state.taskIntent, source: 'model' }, context);
      }

      if (operation.id === 'plan' && result.toolCalls.length > 0) {
        await this.logger.warn('plan-tool-calls-ignored', { count: result.toolCalls.length }, context);
        await this.transition(execution, 'understand', 'plan-cannot-use-tools', context);
        continue;
      }

      if (operation.id === 'finalize' && result.toolCalls.length > 0) {
        await this.logger.warn('finalize-invalid-result', { reason: 'tool-calls', count: result.toolCalls.length }, context);
        const recovered = await this.recoverCurrentStep(state, 'finalize returned tool calls');
        if (recovered && execution.status === 'running') continue;
        break;
      }

      if (result.toolCalls.length > 0) {
        const maxCalls = operation.id === 'understand' ? AgentRuntime.MAX_UNDERSTAND_TOOLS_PER_BATCH : undefined;
        const toolSummary = await this.toolExecutor.execute(result.toolCalls, execution, context, maxCalls);
        this.reporter.tools(toolSummary.executed);

        if (operation.id === 'search') {
          if (toolSummary.useful > 0 && this.operationRegistry.has('understand')) {
            await this.logger.info('search-evidence-found', { attempt: state.searchAttempts, useful: toolSummary.useful, success: toolSummary.success }, context);
            await this.transition(execution, 'understand', 'search-evidence-found', context);
            continue;
          }
          if (state.searchAttempts >= AgentRuntime.MAX_SEARCH_ATTEMPTS && this.operationRegistry.has('understand')) {
            await this.transition(execution, 'understand', 'search-attempt-budget', context);
            continue;
          }
          execution.currentOperation = 'search';
          continue;
        }

        if (operation.id === 'understand') {
          state.understandToolBatches += 1;
          if (state.understandToolBatches >= AgentRuntime.MAX_UNDERSTAND_TOOL_BATCHES) {
            const target = this.afterUnderstandTarget(state.taskIntent);
            if (this.operationRegistry.has(target)) {
              await this.transition(execution, target, 'understand-tool-budget', context);
              continue;
            }
          }
        }

        execution.currentOperation = operation.id;
        continue;
      }

      if (result.changes.length > 0) {
        await this.changeExecutor.apply(result.changes, execution, context);
        this.reporter.changes(result.changes.map((change) => change.path));
        if (operation.id === 'implement' || operation.id === 'edit-file') {
          const target = this.operationRegistry.has('review') ? 'review' : 'finalize';
          await this.transition(execution, target, 'changes-applied', context);
          continue;
        }
      }

      if (result.question) {
        execution.status = 'waiting';
        execution.addEvent('human-question', { question: result.question });
        const answer = await this.human.ask(result.question);
        execution.addEvent('human-answer', { answer });
        execution.status = 'running';
        execution.currentOperation = operation.id;
        continue;
      }

      if (operation.id === 'verify') await this.logger.info('verification-result', { status: result.status, message: result.message }, context);

      if (result.status === 'failed') {
        const recovered = await this.recoverCurrentStep(state, result.message ?? 'operation failed');
        if (recovered) continue;
        break;
        execution.status = 'failed';
        execution.result = result.message ?? 'Operation failed';
        break;
      }

      if (result.status === 'completed') {
        const finalAnswer = result.finalAnswer?.trim();
        const hasAppliedChanges = execution.history.some((event) => event.type === 'change-applied');
        if (operation.id === 'finalize' && !finalAnswer) {
          const recovered = await this.recoverCurrentStep(state, 'finalize completed without finalAnswer');
          if (recovered) continue;
          break;
        }
        if (state.taskIntent === 'write' && !hasAppliedChanges && result.changes.length === 0) {
          const recovered = await this.recoverCurrentStep(state, 'write task has no applied changes');
          if (recovered) continue;
          break;
        }
        execution.status = 'completed';
        execution.result = this.formatFinalResult(result);
        break;
      }

      const requestedNextOperation = result.nextOperation?.trim();
      if (requestedNextOperation) {
        const allowed = operation.allowedTransitions ?? [];
        if (!this.operationRegistry.has(requestedNextOperation) || !allowed.includes(requestedNextOperation)) {
          await this.logger.warn('operation-transition-rejected', { from: operation.id, requested: requestedNextOperation, allowed }, context);
          const nextPlanStep = taskPlan.steps[state.planIndex + 1];
          const fallback = nextPlanStep?.type ?? operation.fallback;
          if (fallback && this.operationRegistry.has(fallback)) {
            await this.transition(execution, fallback, 'invalid-model-transition', context);
            continue;
          }
          execution.currentOperation = operation.id;
          continue;
        }
        await this.transition(execution, requestedNextOperation, 'model-requested', context);
        continue;
      }

      const nextPlanStep = taskPlan.steps[state.planIndex + 1];
      if (result.status === 'continue' && nextPlanStep && nextPlanStep.type !== operation.id) {
        if (activePlanStep) activePlanStep.status = 'completed';
        state.planIndex += 1;
        state.planStepAttempts = 0;
        await this.transition(execution, nextPlanStep.type, 'plan-next-step', context);
        continue;
      }

      if (operation.id === 'finalize' && result.status === 'continue') {
        const recovered = await this.recoverCurrentStep(state, 'finalize did not complete');
        if (recovered && execution.status === 'running') continue;
        break;
      }

      execution.currentOperation = operation.id;
    }

    if (execution.status === 'running') {
      state.pauseReason = 'safety-step-budget';
      execution.status = 'paused';
      execution.result = `Execution paused after ${safetyMaxSteps} steps in this run. Type "продолжи" to resume.`;
      execution.addEvent('execution-paused', { reason: state.pauseReason, safetyMaxSteps });
      await this.logger.warn('execution-paused', { reason: state.pauseReason, safetyMaxSteps }, context);
    }

    return this.finishOrPause(state);
  }

  private async recoverCurrentStep(state: RuntimeState, reason: string, humanHint?: string): Promise<boolean> {
    const step = state.taskPlan.steps[state.planIndex];
    if (!step) return false;

    const attempts = state.recoveryAttempts.get(step.id) ?? 0;
    if (attempts >= 1 && !humanHint) {
      this.pause(state, `step:${step.id}:${reason}`, `Не удалось автоматически восстановить шаг «${step.goal}».`);
      return false;
    }

    state.recoveryAttempts.set(step.id, attempts + 1);
    this.reporter.recovery(step.goal, reason);
    const decision = await this.recoveryController.recover({
      task: state.task,
      execution: state.execution,
      plan: state.taskPlan,
      stepIndex: state.planIndex,
      reason,
      humanHint,
    });
    return this.applyRecoveryDecision(state, decision);
  }

  private applyRecoveryDecision(state: RuntimeState, decision: RecoveryDecision): boolean {
    const current = state.taskPlan.steps[state.planIndex];
    this.reporter.recoveryDecision(decision.action, decision.reason);
    state.execution.addEvent('plan-recovery', decision);

    if (decision.action === 'retry-current') {
      current.status = 'pending';
      state.planStepAttempts = 0;
      state.execution.currentOperation = current.type;
      return true;
    }

    if (decision.action === 'insert-steps' && decision.steps.length > 0) {
      this.planUpdater.insertBefore(state.taskPlan, state.planIndex, decision.steps);
      this.planUpdater.markPendingFrom(state.taskPlan, state.planIndex);
      state.planStepAttempts = 0;
      state.execution.currentOperation = decision.steps[0].type;
      this.reporter.planUpdated(state.taskPlan, state.planIndex, decision.steps.length);
      return true;
    }

    if (decision.action === 'skip-current') {
      current.status = 'completed';
      const next = state.taskPlan.steps[state.planIndex + 1];
      if (!next) {
        this.pause(state, `step:${current.id}:no-next-step`, 'Recovery пропустил шаг, но продолжать план некуда.');
        return false;
      }
      state.planIndex += 1;
      state.planStepAttempts = 0;
      state.execution.currentOperation = next.type;
      return true;
    }

    if (decision.action === 'request-human') {
      this.pause(state, `step:${current.id}:${decision.reason}`, decision.reason);
      return false;
    }

    state.execution.status = 'failed';
    state.execution.result = decision.reason || 'Recovery failed';
    return false;
  }

  private pause(state: RuntimeState, reason: string, message: string): void {
    state.pauseReason = reason;
    state.execution.status = 'paused';
    state.execution.result = message;
    state.execution.addEvent('execution-paused', { reason, message });
    this.pausedByConversation.set(state.task.conversationId, state);
    this.reporter.paused(message);
  }

  private finishOrPause(state: RuntimeState): Execution {
    if (state.execution.status === 'paused') {
      this.pausedByConversation.set(state.task.conversationId, state);
      return state.execution;
    }
    this.pausedByConversation.delete(state.task.conversationId);
    return this.finish(state);
  }

  private finish(state: RuntimeState): Execution {
    const { execution, task } = state;
    const context = this.logContext(task, execution);
    const metrics = this.executionMetrics(execution, state.startedAt);
    execution.addEvent('execution-metrics', metrics);
    void this.logger.info('execution-metrics', metrics, context);
    execution.addEvent('execution-finished', { status: execution.status, result: execution.result });
    void this.logger.info('execution-finished', { status: execution.status, result: execution.result }, context);
    const changedFiles = new Set(execution.history
      .filter((event) => event.type === 'change-applied')
      .map((event) => (event.data as { path?: string } | undefined)?.path)
      .filter((path): path is string => Boolean(path))).size;
    if (execution.status === 'completed') this.reporter.completed(execution.result ?? 'Completed', metrics.durationMs, changedFiles);
    else if (execution.status === 'failed') this.reporter.failed(execution.result ?? execution.status, metrics.durationMs);
    return execution;
  }

  private executionMetrics(execution: Execution, startedAt: number) {
    const operations: Record<string, number> = {};
    let modelCalls = 0;
    let toolCalls = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    for (const event of execution.history) {
      if (event.type === 'operation-started') {
        const operation = (event.data as { operation?: string } | undefined)?.operation;
        if (operation) operations[operation] = (operations[operation] ?? 0) + 1;
      }
      if (event.type === 'tool-result') toolCalls += 1;
      if (event.type === 'model-usage') {
        modelCalls += 1;
        const usage = (event.data as { usage?: Record<string, unknown> } | undefined)?.usage;
        if (usage) {
          promptTokens += Number(usage.prompt_tokens ?? 0);
          completionTokens += Number(usage.completion_tokens ?? 0);
        }
      }
    }
    return { durationMs: Date.now() - startedAt, modelCalls, toolCalls, promptTokens, completionTokens, operations };
  }

  private formatFinalResult(result: OperationResult): string {
    const finalAnswer = result.finalAnswer?.trim();
    if (finalAnswer) return finalAnswer;
    const parts: string[] = [];
    if (result.message?.trim()) parts.push(result.message.trim());
    if (result.observations.length > 0) parts.push(result.observations.map((item) => `- ${item}`).join('\n'));
    return parts.join('\n\n') || 'Completed';
  }

  private async transition(execution: Execution, to: string, reason: string, context: ReturnType<AgentRuntime['logContext']>): Promise<void> {
    const from = execution.currentOperation;
    execution.currentOperation = to;
    execution.addEvent('operation-transition', { from, to, reason });
    await this.logger.info('operation-transition', { from, to, reason }, context);
    this.reporter.transition(from, to, reason);
  }

  private async resolveOperation(id: string, task: Task, execution: Execution): Promise<OperationProfile | undefined> {
    const profile = this.operationRegistry.get(id);
    if (profile) return profile;
    const context = this.logContext(task, execution);
    execution.addEvent('missing-operation', { operation: id });
    await this.logger.warn('missing-operation', { operation: id }, context);
    return id !== 'understand' ? this.operationRegistry.get('understand') : undefined;
  }

  private afterUnderstandTarget(intent: TaskIntent): 'prepare-change' | 'implement' | 'finalize' {
    if (intent !== 'write') return 'finalize';
    return this.operationRegistry.has('prepare-change') ? 'prepare-change' : 'implement';
  }

  private inferTaskIntent(description: string): TaskIntent {
    const normalized = description.toLowerCase();
    const writeSignals = ['добав', 'измени', 'измен', 'исправ', 'удали', 'создай', 'рефактор', 'реализ', 'add ', 'change ', 'modify ', 'fix ', 'delete ', 'remove ', 'create ', 'implement ', 'refactor '];
    return writeSignals.some((signal) => normalized.includes(signal)) ? 'write' : 'read';
  }

  private logContext(task: Task, execution: Execution) {
    return { projectId: task.projectId, conversationId: task.conversationId, taskId: task.id, executionId: execution.id };
  }
}

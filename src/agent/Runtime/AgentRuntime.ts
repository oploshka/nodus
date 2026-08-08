import type { PlanGenerator } from '@agent/Planning/PlanGenerator';
import { PlanExecutor, type PlanExecutionState } from '@agent/Planning/PlanExecutor';
import { ExecutionContext } from '@agent/Planning/ExecutionContext';
import type { ExecutionReporter } from '@agent/Reporting/ExecutionReporter';
import type { Conversation } from '@core/Conversation/Conversation';
import { Execution } from '@core/Execution/Execution';
import type { Logger } from '@core/Logging/Logger';
import type { Task } from '@core/Task/Task';

export class AgentRuntime {
  private readonly pausedByConversation = new Map<string, PlanExecutionState>();

  public constructor(
    private readonly logger: Logger,
    private readonly reporter: ExecutionReporter,
    private readonly planGenerator: PlanGenerator,
    private readonly planExecutor: PlanExecutor,
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

    const plan = await this.planGenerator.generate(task, execution.id);
    execution.addEvent('task-plan', plan);
    this.reporter.plan(plan);
    execution.currentOperation = plan.steps[0]?.type;

    const state: PlanExecutionState = {
      task,
      conversation,
      execution,
      plan,
      planIndex: 0,
      stepAttempts: 0,
      recoveryAttempts: new Map(),
      stepResults: new Map(),
      executionContext: new ExecutionContext(),
      recoveryMissing: new Map(),
      recoveryGoals: new Set(),
      resumes: 0,
      startedAt: Date.now(),
    };

    await this.logger.info('execution-started', { operation: execution.currentOperation, planSteps: plan.steps.length }, this.context(state));
    await this.planExecutor.run(state);
    return this.finishOrPause(state);
  }

  public async resume(conversationId: string, humanHint?: string): Promise<Execution | undefined> {
    const state = this.pausedByConversation.get(conversationId);
    if (!state) return undefined;

    if (state.resumes >= PlanExecutor.MAX_RESUMES) {
      state.execution.status = 'failed';
      state.execution.result = `Execution resume limit exceeded (${PlanExecutor.MAX_RESUMES})`;
      this.pausedByConversation.delete(conversationId);
      return this.finish(state);
    }

    state.resumes += 1;
    state.execution.addEvent('execution-resumed', { resume: state.resumes, humanHint });
    if (humanHint?.trim()) state.execution.addEvent('human-hint', { hint: humanHint.trim() });
    this.reporter.resumed(state.resumes, humanHint);
    await this.logger.info('execution-resumed', { resume: state.resumes, humanHint }, this.context(state));

    let canContinue = true;
    if (humanHint?.trim()) canContinue = await this.planExecutor.recoverWithHint(state, humanHint.trim());
    else this.planExecutor.retryPausedStep(state);

    state.pauseReason = undefined;
    this.pausedByConversation.delete(conversationId);
    if (canContinue && state.execution.status === 'running') await this.planExecutor.run(state);
    return this.finishOrPause(state);
  }

  private finishOrPause(state: PlanExecutionState): Execution {
    if (state.execution.status === 'paused') {
      this.pausedByConversation.set(state.task.conversationId, state);
      return state.execution;
    }
    this.pausedByConversation.delete(state.task.conversationId);
    return this.finish(state);
  }

  private finish(state: PlanExecutionState): Execution {
    const metrics = this.executionMetrics(state.execution, state.startedAt);
    const context = this.context(state);
    state.execution.addEvent('execution-metrics', metrics);
    void this.logger.info('execution-metrics', metrics, context);
    state.execution.addEvent('execution-finished', { status: state.execution.status, result: state.execution.result });
    void this.logger.info('execution-finished', { status: state.execution.status, result: state.execution.result }, context);

    const changedFiles = new Set(state.execution.history
      .filter((event) => event.type === 'change-applied')
      .map((event) => (event.data as { path?: string } | undefined)?.path)
      .filter((path): path is string => Boolean(path))).size;

    if (state.execution.status === 'completed') this.reporter.completed(state.execution.result ?? 'Completed', metrics.durationMs, changedFiles);
    else if (state.execution.status === 'failed') this.reporter.failed(state.execution.result ?? 'Failed', metrics.durationMs);
    return state.execution;
  }

  private executionMetrics(execution: Execution, startedAt: number) {
    const operations: Record<string, number> = {};
    let modelCalls = 0;
    let toolCalls = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    for (const event of execution.history) {
      if (event.type === 'plan-step-started') {
        const operation = (event.data as { type?: string } | undefined)?.type;
        if (operation) operations[operation] = (operations[operation] ?? 0) + 1;
      }
      if (event.type === 'tool-result') toolCalls += 1;
      if (event.type === 'model-usage') {
        modelCalls += 1;
        const usage = (event.data as { usage?: Record<string, unknown> } | undefined)?.usage;
        promptTokens += Number(usage?.prompt_tokens ?? 0);
        completionTokens += Number(usage?.completion_tokens ?? 0);
      }
    }
    return { durationMs: Date.now() - startedAt, modelCalls, toolCalls, promptTokens, completionTokens, operations };
  }

  private context(state: PlanExecutionState) {
    return { projectId: state.task.projectId, conversationId: state.task.conversationId, taskId: state.task.id, executionId: state.execution.id };
  }
}

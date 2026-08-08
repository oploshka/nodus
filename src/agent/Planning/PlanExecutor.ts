import type { ChangeExecutor } from '@agent/Execution/ChangeExecutor';
import type { ToolExecutor } from '@agent/Execution/ToolExecutor';
import type { HumanInteraction } from '@agent/Human/HumanInteraction';
import type { PlanUpdater } from '@agent/Planning/PlanUpdater';
import type { RecoveryController, RecoveryDecision } from '@agent/Planning/RecoveryController';
import type { PlanStep, TaskPlan } from '@agent/Planning/TaskPlan';
import type { ExecutionReporter } from '@agent/Reporting/ExecutionReporter';
import type { Conversation } from '@core/Conversation/Conversation';
import type { Execution } from '@core/Execution/Execution';
import type { Logger } from '@core/Logging/Logger';
import type { Task } from '@core/Task/Task';
import type { ModelController } from '@model/Controller/ModelController';
import type { OperationResult, StepResult } from '@model/Result/OperationResult';
import type { OperationRegistry } from '@operation/Registry/OperationRegistry';

export interface PlanExecutionState {
  task: Task;
  conversation: Conversation;
  execution: Execution;
  plan: TaskPlan;
  planIndex: number;
  stepAttempts: number;
  recoveryAttempts: Map<string, number>;
  stepResults: Map<string, StepResult>;
  recoveryMissing: Map<string, string[]>;
  recoveryGoals: Set<string>;
  resumes: number;
  startedAt: number;
  pauseReason?: string;
}

export type PlanRunResult = 'finished' | 'paused';

export class PlanExecutor {
  public static readonly MAX_RESUMES = 3;
  private static readonly SAFETY_NODE_EXECUTIONS = 50;

  public constructor(
    private readonly operationRegistry: OperationRegistry,
    private readonly modelController: ModelController,
    private readonly toolExecutor: ToolExecutor,
    private readonly changeExecutor: ChangeExecutor,
    private readonly human: HumanInteraction,
    private readonly recoveryController: RecoveryController,
    private readonly planUpdater: PlanUpdater,
    private readonly logger: Logger,
    private readonly reporter: ExecutionReporter,
  ) {}

  public async run(state: PlanExecutionState): Promise<PlanRunResult> {
    let nodeExecutions = 0;
    while (state.execution.status === 'running' && state.planIndex < state.plan.steps.length) {
      if (nodeExecutions >= PlanExecutor.SAFETY_NODE_EXECUTIONS) {
        this.pause(state, 'safety-node-budget', 'Достигнут аварийный лимит выполнения плана.');
        return 'paused';
      }
      nodeExecutions += 1;

      const step = state.plan.steps[state.planIndex];
      if (state.stepAttempts >= step.maxAttempts) {
        const recovered = await this.recover(state, 'step-attempt-budget');
        if (!recovered) return state.pauseReason ? 'paused' : 'finished';
        continue;
      }

      state.stepAttempts += 1;
      step.status = 'running';
      state.execution.currentStep += 1;
      state.execution.currentOperation = step.type;
      const context = this.context(state);
      state.execution.addEvent('plan-step-started', {
        planIndex: state.planIndex,
        stepId: step.id,
        type: step.type,
        goal: step.goal,
        attempt: state.stepAttempts,
      });
      await this.logger.info('plan-step-started', {
        planIndex: state.planIndex,
        stepId: step.id,
        type: step.type,
        goal: step.goal,
        attempt: state.stepAttempts,
      }, context);
      this.reporter.planStep(state.planIndex, state.plan.steps.length, step.goal, step.type, state.stepAttempts, step.maxAttempts);

      const operation = this.operationRegistry.get(step.type);
      if (!operation) {
        const recovered = await this.recover(state, `operation-not-available:${step.type}`);
        if (!recovered) return state.pauseReason ? 'paused' : 'finished';
        continue;
      }

      let result: OperationResult;
      try {
        result = await this.modelController.execute({
          task: state.task,
          execution: state.execution,
          conversation: state.conversation,
          operation,
          activeStep: { id: step.id, type: step.type, goal: step.goal, attempt: state.stepAttempts, maxAttempts: step.maxAttempts },
          stepEvidence: this.completedEvidence(state),
        });
      } catch (error) {
        await this.logger.error('model-error', { operation: step.type, error: String(error) }, context);
        state.execution.addEvent('model-error', { operation: step.type, error: String(error) });
        const recovered = await this.recover(state, `model-error:${String(error)}`);
        if (!recovered) return state.pauseReason ? 'paused' : 'finished';
        continue;
      }

      this.reporter.note(step.type, result.message);
      state.execution.addEvent('plan-step-result', {
        stepId: step.id,
        type: step.type,
        status: result.status,
        message: result.message,
        stepResult: result.stepResult,
        ignoredNextOperation: result.nextOperation,
      });

      if (result.stepResult) {
        state.stepResults.set(step.id, result.stepResult);
        this.reporter.stepResult(result.stepResult);
      }

      if (result.status === 'failed') {
        const recovered = await this.recover(state, result.message ?? 'step failed');
        if (!recovered) return state.pauseReason ? 'paused' : 'finished';
        continue;
      }

      if (result.question) {
        state.execution.status = 'waiting';
        const answer = await this.human.ask(result.question);
        state.execution.addEvent('human-answer', { question: result.question, answer });
        state.execution.status = 'running';
        continue;
      }

      if (result.toolCalls.length > 0) {
        const summary = await this.toolExecutor.execute(result.toolCalls, state.execution, context);
        this.reporter.tools(summary.executed);
        // Tool calls gather raw evidence for the immediate next model call.
        // The model must summarize that evidence into stepResult before the semantic step can complete.
        continue;
      }

      if (result.changes.length > 0) {
        await this.changeExecutor.apply(result.changes, state.execution, context);
        this.reporter.changes(result.changes.map((change) => change.path));
      }

      if (step.type === 'edit-file') {
        const changed = result.changes.length > 0 || this.hasAppliedChanges(state.execution);
        if (!changed) {
          const recovered = await this.recover(state, 'edit-file produced no applied changes');
          if (!recovered) return state.pauseReason ? 'paused' : 'finished';
          continue;
        }
      }

      if (step.type === 'finalize') {
        const finalAnswer = result.finalAnswer?.trim();
        if (!finalAnswer) {
          const recovered = await this.recover(state, 'finalize produced no finalAnswer');
          if (!recovered) return state.pauseReason ? 'paused' : 'finished';
          continue;
        }
        state.execution.status = 'completed';
        state.execution.result = finalAnswer;
        step.status = 'completed';
        state.execution.addEvent('plan-step-completed', { stepId: step.id, type: step.type });
        return 'finished';
      }

      // Routing belongs to TaskPlan. Search/understand/change-planning/review/verify
      // must explicitly prove that the active step goal is satisfied.
      if (this.requiresExplicitStepResult(step.type)) {
        if (result.stepResult?.goalSatisfied) {
          this.completeStep(state, step, 'goal-satisfied');
          continue;
        }
        if (state.stepAttempts < step.maxAttempts) continue;
        const recovered = await this.recover(state, 'step-goal-not-satisfied');
        if (!recovered) return state.pauseReason ? 'paused' : 'finished';
        continue;
      }

      this.completeStep(state, step, 'step-result-ready');
    }

    if (state.execution.status === 'running') {
      state.execution.status = 'failed';
      state.execution.result = 'Task plan ended without a finalize result.';
    }
    return 'finished';
  }

  public retryPausedStep(state: PlanExecutionState): void {
    const step = state.plan.steps[state.planIndex];
    if (!step) return;
    step.status = 'pending';
    state.stepAttempts = 0;
    state.recoveryAttempts.set(step.id, 0);
    state.execution.status = 'running';
    state.execution.currentOperation = step.type;
  }

  public async recoverWithHint(state: PlanExecutionState, hint: string): Promise<boolean> {
    state.execution.status = 'running';
    return this.recover(state, 'human-resume-with-hint', hint);
  }

  private completeStep(state: PlanExecutionState, step: PlanStep, reason: string): void {
    step.status = 'completed';
    state.execution.addEvent('plan-step-completed', { stepId: step.id, type: step.type, reason });
    state.planIndex += 1;
    state.stepAttempts = 0;
    const next = state.plan.steps[state.planIndex];
    state.execution.currentOperation = next?.type;
    if (next) this.reporter.planAdvance(state.planIndex, state.plan.steps.length, next.goal, next.type);
  }

  private async recover(state: PlanExecutionState, reason: string, humanHint?: string): Promise<boolean> {
    const step = state.plan.steps[state.planIndex];
    if (!step) return false;
    const count = state.recoveryAttempts.get(step.id) ?? 0;
    if (count >= 1 && !humanHint) {
      this.pause(state, `step:${step.id}:${reason}`, `Не удалось автоматически завершить шаг «${step.goal}».`);
      return false;
    }

    state.recoveryAttempts.set(step.id, count + 1);
    this.reporter.recovery(step.goal, reason);
    const decision = await this.recoveryController.recover({
      task: state.task,
      execution: state.execution,
      plan: state.plan,
      stepIndex: state.planIndex,
      reason,
      humanHint,
      currentStepResult: state.stepResults.get(step.id),
      completedStepEvidence: this.completedEvidence(state),
      previousRecoveryGoals: Array.from(state.recoveryGoals),
    });
    return this.applyRecovery(state, decision);
  }

  private applyRecovery(state: PlanExecutionState, decision: RecoveryDecision): boolean {
    const current = state.plan.steps[state.planIndex];
    this.reporter.recoveryDecision(decision.action, decision.reason);
    state.execution.addEvent('plan-recovery', decision);

    if (decision.action === 'retry-current') {
      current.status = 'pending';
      state.stepAttempts = 0;
      return true;
    }
    if (decision.action === 'insert-steps' && decision.steps.length > 0) {
      const currentResult = state.stepResults.get(current.id);
      const missing = currentResult?.missing ?? [];
      const previousMissing = state.recoveryMissing.get(current.id);
      const noMissingProgress = Boolean(previousMissing && !this.missingReduced(previousMissing, missing));
      const freshSteps = decision.steps.filter((step) => {
        const signature = this.goalSignature(step.goal);
        return signature && !state.recoveryGoals.has(signature) && !this.isDuplicatePlanGoal(state.plan, step.goal);
      });

      if (noMissingProgress || freshSteps.length === 0) {
        this.pause(state, `step:${current.id}:recovery-no-progress`, `Восстановление не принесло новых данных для шага «${current.goal}». Нужна подсказка.`);
        return false;
      }

      state.recoveryMissing.set(current.id, [...missing]);
      for (const step of freshSteps) state.recoveryGoals.add(this.goalSignature(step.goal));
      this.planUpdater.insertBefore(state.plan, state.planIndex, freshSteps);
      this.planUpdater.markPendingFrom(state.plan, state.planIndex);
      state.stepAttempts = 0;
      this.reporter.planUpdated(state.plan, state.planIndex, freshSteps.length);
      return true;
    }
    if (decision.action === 'skip-current') {
      current.status = 'completed';
      state.planIndex += 1;
      state.stepAttempts = 0;
      return state.planIndex < state.plan.steps.length;
    }
    if (decision.action === 'request-human') {
      this.pause(state, `step:${current.id}:${decision.reason}`, decision.reason);
      return false;
    }
    state.execution.status = 'failed';
    state.execution.result = decision.reason || 'Recovery failed';
    return false;
  }

  private pause(state: PlanExecutionState, reason: string, message: string): void {
    state.pauseReason = reason;
    state.execution.status = 'paused';
    state.execution.result = message;
    state.execution.addEvent('execution-paused', { reason, message });
    this.reporter.paused(message);
  }

  private hasAppliedChanges(execution: Execution): boolean {
    return execution.history.some((event) => event.type === 'change-applied');
  }


  private requiresExplicitStepResult(type: string): boolean {
    return type === 'search' || type === 'understand' || type === 'prepare-change' || type === 'review' || type === 'verify';
  }

  private completedEvidence(state: PlanExecutionState) {
    return state.plan.steps
      .filter((step) => step.status === 'completed')
      .flatMap((step) => {
        const result = state.stepResults.get(step.id);
        if (!result) return [];
        return [{ stepId: step.id, type: step.type, goal: step.goal, findings: result.findings, evidence: result.evidence, missing: result.missing }];
      })
      .slice(-8);
  }

  private missingReduced(previous: string[], current: string[]): boolean {
    if (previous.length === 0) return current.length === 0;
    if (current.length < previous.length) return true;
    const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
    const old = new Set(previous.map(normalize));
    return current.some((item) => !old.has(normalize(item)));
  }

  private goalSignature(goal: string): string {
    return goal.toLowerCase().replace(/[^a-zа-яё0-9]+/giu, ' ').replace(/\s+/g, ' ').trim();
  }

  private isDuplicatePlanGoal(plan: TaskPlan, goal: string): boolean {
    const signature = this.goalSignature(goal);
    if (!signature) return true;
    return plan.steps.some((step) => this.goalSignature(step.goal) === signature);
  }

  private context(state: PlanExecutionState) {
    return {
      projectId: state.task.projectId,
      conversationId: state.task.conversationId,
      taskId: state.task.id,
      executionId: state.execution.id,
    };
  }
}

// PlanExecutor.ts
import type { ChangeExecutor } from '@agent/Execution/ChangeExecutor';
import type { ToolExecutor } from '@agent/Execution/ToolExecutor';
import type { HumanInteraction } from '@agent/Human/HumanInteraction';
import type { PlanUpdater } from '@agent/Planning/PlanUpdater';
import type { RecoveryController, RecoveryDecision } from '@agent/Planning/RecoveryController';
import type { PlanStep, TaskPlan } from '@agent/Planning/TaskPlan';
import { ExecutionContext, type ExecutionFact } from '@agent/Planning/ExecutionContext';
import { ContextComposer } from '@agent/Planning/ContextComposer';
import type { ExecutionReporter } from '@agent/Reporting/ExecutionReporter';
import type { Conversation } from '@core/Conversation/Conversation';
import type { Execution, ToolContextEntry } from '@core/Execution/Execution';
import type { LogContext } from '@core/Logging/Log';
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
  executionContext: ExecutionContext;
  recoveryMissing: Map<string, string[]>;
  recoveryGoals: Set<string>;
  stepProgress?: Map<string, string[]>;
  editFileToolContext?: Map<string, ToolContextEntry[]>;
  stepToolCallSignatures?: Map<string, Set<string>>;
  resumes: number;
  startedAt: number;
  pauseReason?: string;
  retryReason?: string;
}

export type PlanRunResult = 'finished' | 'paused';

export class PlanExecutor {
  public static readonly MAX_RESUMES = 3;
  private readonly contextComposer = new ContextComposer();
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

      if (step.status === 'completed') {
        state.planIndex += 1;
        state.stepAttempts = 0;
        state.retryReason = undefined;
        continue;
      }

      if (step.recoveryForStepId && await this.tryPruneRecoveryBranch(state, step.recoveryForStepId)) {
        continue;
      }

      // Step outputs are postconditions. If recovery or an earlier equivalent step has already
      // established every output, there is nothing left for the model to do here.
      if (this.outputsAlreadySatisfied(state, step)) {
        this.reporter.stepAlreadySatisfiedAt(state.planIndex, state.plan.steps.length, step.goal, step.type, step.outputs);
        this.completeStep(state, step, 'outputs-already-satisfied');
        continue;
      }

      const composed = this.contextComposer.compose(state.executionContext, step);
      if (await this.trySemanticSatisfaction(state, step, composed.facts)) {
        continue;
      }

      if (composed.missingInputs.length > 0) {
        const blocked: StepResult = {
          goalSatisfied: false,
          findings: [],
          evidence: [],
          missing: composed.missingInputs.map((key) => `required input fact: ${key}`),
          facts: [],
        };
        state.stepResults.set(step.id, this.mergeStepResults(state.stepResults.get(step.id), blocked));
        const recovered = await this.recover(state, `missing-inputs:${composed.missingInputs.join(',')}`);
        if (!recovered) return state.pauseReason ? 'paused' : 'finished';
        continue;
      }
      if (state.stepAttempts >= step.maxAttempts) {
        const reason = this.hasRepeatedStepProgress(state, step.id) ? 'step-no-progress' : 'step-attempt-budget';
        const recovered = await this.recover(state, reason);
        if (!recovered) return state.pauseReason ? 'paused' : 'finished';
        continue;
      }

      this.reporter.planStep(
        state.planIndex,
        state.plan.steps.length,
        step.goal,
        step.type,
        state.stepAttempts + 1,
        step.maxAttempts,
        state.retryReason,
      );
      state.retryReason = undefined;
      this.reporter.contextCompose(step.inputs, composed.facts.map((fact) => fact.key), composed.missingInputs);

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
      const operation = this.operationRegistry.get(step.type);
      if (!operation) {
        const recovered = await this.recover(state, `operation-not-available:${step.type}`);
        if (!recovered) return state.pauseReason ? 'paused' : 'finished';
        continue;
      }

      if (step.type === 'edit-file') {
        await this.ensureEditFileTargetContext(state, step, context);
      }

      let result: OperationResult;
      try {
        result = await this.modelController.execute({
          task: state.task,
          execution: state.execution,
          conversation: state.conversation,
          operation,
          activeStep: { id: step.id, type: step.type, goal: step.goal, attempt: state.stepAttempts, maxAttempts: step.maxAttempts, inputs: step.inputs, outputs: step.outputs, targetPath: step.targetPath },
          stepContext: {
            ...composed,
            activeEvidence: this.activeEvidence(state.stepResults.get(step.id)),
          },
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
        const merged = this.mergeStepResults(state.stepResults.get(step.id), result.stepResult);
        state.stepResults.set(step.id, merged);
        const mergedKeys = state.executionContext.mergeStepResult(step, merged);
        this.reporter.factsMerged(mergedKeys);
        this.reporter.stepResult(merged);
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
        const toolCalls = step.type === 'edit-file'
          ? this.filterEditFileToolCalls(state, step, result.toolCalls)
          : result.toolCalls;

        if (step.type === 'edit-file' && toolCalls.length === 0) {
          state.retryReason = `целевой файл ${step.targetPath ?? ''} уже предоставлен модели; повторное чтение пропущено`;
          continue;
        }

        const summary = await this.toolExecutor.execute(toolCalls, state.execution, context);
        this.reporter.tools(summary.executed);
        if (step.type === 'edit-file') this.rememberEditFileToolContext(state, step, toolCalls);

        // Search/understand no longer decide completion by themselves after a tool round.
        // A dedicated evaluator sees the accumulated evidence + the latest raw tool results
        // and decides the step postcondition before another expensive search attempt is allowed.
        if (step.type === 'search' || step.type === 'understand') {
          const evaluated = await this.evaluateToolRound(state, step);
          if (evaluated) continue;
        }

        const currentResult = state.stepResults.get(step.id);
        const missing = currentResult?.missing ?? [];
        state.retryReason = missing.length > 0
          ? `нужны дополнительные данные: ${missing.slice(0, 2).join('; ')}`
          : `модель запросила дополнительные данные (${result.toolCalls.length} инструментов)`;
        continue;
      }

      if (result.changes.length > 0) {
        await this.changeExecutor.apply(result.changes, state.execution, context);
        this.reporter.changes(result.changes.map((change) => change.path));
        if (step.type === 'edit-file') {
          const synthetic: StepResult = {
            goalSatisfied: true,
            findings: [`Applied changes to: ${result.changes.map((change) => change.path).join(', ')}`],
            evidence: result.changes.map((change) => ({ path: change.path, fact: 'File change applied by ChangeExecutor.' })),
            missing: [],
            facts: step.outputs.map((key) => ({
              key,
              value: `Applied requested edit to ${result.changes.map((change) => change.path).join(', ')}`,
              evidence: result.changes.map((change) => ({ path: change.path, fact: 'File change applied by ChangeExecutor.' })),
            })),
          };
          const merged = this.mergeStepResults(state.stepResults.get(step.id), synthetic);
          state.stepResults.set(step.id, merged);
          const mergedKeys = state.executionContext.mergeStepResult(step, merged);
          this.reporter.factsMerged(mergedKeys);
        }
      }

      if (step.type === 'edit-file') {
        const changed = result.changes.length > 0;
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
        const mergedResult = state.stepResults.get(step.id);
        const outputsReady = step.outputs.length > 0 && step.outputs.every((key) => state.executionContext.has(key));
        if (mergedResult?.goalSatisfied || outputsReady) {
          if (step.type === 'prepare-change') {
            const targets = mergedResult?.targets ?? [];
            if (targets.length === 0) {
              if (state.stepAttempts < step.maxAttempts) continue;
              const recovered = await this.recover(state, 'prepare-change produced no target files');
              if (!recovered) return state.pauseReason ? 'paused' : 'finished';
              continue;
            }
            this.expandEditFileSteps(state, targets);
          }
          this.completeStep(state, step, outputsReady ? 'outputs-ready' : 'goal-satisfied');
          continue;
        }
        if (state.stepAttempts < step.maxAttempts) {
          this.recordStepProgress(state, step.id, mergedResult);
          const missing = mergedResult?.missing ?? [];
          state.retryReason = missing.length > 0
            ? `цель ещё не достигнута: ${missing.slice(0, 2).join('; ')}`
            : 'цель шага ещё не подтверждена';
          continue;
        }
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
    state.retryReason = 'продолжение после паузы';
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
    state.retryReason = undefined;
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
    this.reporter.recovery(state.planIndex, step.goal, this.humanRecoveryReason(reason, state.stepResults.get(step.id)));
    const decision = await this.recoveryController.recover({
      task: state.task,
      execution: state.execution,
      plan: state.plan,
      stepIndex: state.planIndex,
      reason,
      humanHint,
      currentStepResult: state.stepResults.get(step.id),
      completedStepEvidence: this.completedEvidence(state),
      executionFacts: state.executionContext.all(),
      previousRecoveryGoals: Array.from(state.recoveryGoals),
    });
    return this.applyRecovery(state, decision);
  }

  private applyRecovery(state: PlanExecutionState, decision: RecoveryDecision): boolean {
    const current = state.plan.steps[state.planIndex];
    this.reporter.recoveryDecision(decision.action, decision.reason);
    state.execution.addEvent('plan-recovery', decision);

    if (decision.action === 'retry-current') {
      if (this.hasRepeatedStepProgress(state, current.id)) {
        this.pause(
          state,
          `step:${current.id}:recovery-no-progress`,
          `Повтор шага «${current.goal}» остановлен: последние попытки не дали новых данных.`,
        );
        return false;
      }
      current.status = 'pending';
      state.stepAttempts = 0;
      state.retryReason = decision.reason || 'recovery requested retry';
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
      this.ensureUniqueStepIds(state.plan, freshSteps);
      for (const step of freshSteps) {
        step.recoveryForStepId = current.id;
        step.inputs = step.inputs.filter((key) => state.executionContext.has(key));
        state.recoveryGoals.add(this.goalSignature(step.goal));
        for (const output of step.outputs) {
          // A recovery step that produces one of the parent's own outputs satisfies the
          // parent's postcondition. Do not turn that output into a self-dependency.
          if (current.outputs.includes(output)) continue;
          if (!current.inputs.includes(output)) current.inputs.push(output);
        }
      }
      this.planUpdater.insertBefore(state.plan, state.planIndex, freshSteps);
      this.planUpdater.markPendingFrom(state.plan, state.planIndex);
      state.stepAttempts = 0;
      state.retryReason = undefined;
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


  private async ensureEditFileTargetContext(
    state: PlanExecutionState,
    step: PlanStep,
    context: LogContext,
  ): Promise<void> {
    if (!step.targetPath) return;

    const cache = state.editFileToolContext ?? (state.editFileToolContext = new Map());
    const cached = cache.get(step.id);
    if (cached && cached.length > 0) {
      const current = state.execution.getToolContext();
      const merged = [...cached, ...current].filter((entry, index, all) => (
        all.findIndex((candidate) => this.toolCallSignature(candidate.call) === this.toolCallSignature(entry.call)) === index
      ));
      state.execution.setToolContext(merged, 1);
      return;
    }

    const call = { tool: 'file-system', input: { action: 'read', path: step.targetPath } };
    const summary = await this.toolExecutor.execute([call], state.execution, context, 1);
    this.reporter.tools(summary.executed);
    const entries = state.execution.getToolContext();
    if (entries.length > 0) cache.set(step.id, entries);
    this.rememberToolCallSignature(state, step.id, call);
  }

  private filterEditFileToolCalls(
    state: PlanExecutionState,
    step: PlanStep,
    calls: OperationResult['toolCalls'],
  ): OperationResult['toolCalls'] {
    const seen = state.stepToolCallSignatures ?? (state.stepToolCallSignatures = new Map());
    const signatures = seen.get(step.id) ?? new Set<string>();
    const fresh = calls.filter((call) => {
      const signature = this.toolCallSignature(call);
      if (signatures.has(signature)) return false;
      signatures.add(signature);
      return true;
    });
    seen.set(step.id, signatures);
    return fresh;
  }

  private rememberEditFileToolContext(
    state: PlanExecutionState,
    step: PlanStep,
    calls: OperationResult['toolCalls'],
  ): void {
    for (const call of calls) this.rememberToolCallSignature(state, step.id, call);
    const entries = state.execution.getToolContext();
    if (entries.length === 0) return;
    const cache = state.editFileToolContext ?? (state.editFileToolContext = new Map());
    const previous = cache.get(step.id) ?? [];
    const merged = [...previous, ...entries].filter((entry, index, all) => (
      all.findIndex((candidate) => this.toolCallSignature(candidate.call) === this.toolCallSignature(entry.call)) === index
    ));
    cache.set(step.id, merged.slice(0, 3));
  }

  private rememberToolCallSignature(state: PlanExecutionState, stepId: string, call: OperationResult['toolCalls'][number]): void {
    const map = state.stepToolCallSignatures ?? (state.stepToolCallSignatures = new Map());
    const signatures = map.get(stepId) ?? new Set<string>();
    signatures.add(this.toolCallSignature(call));
    map.set(stepId, signatures);
  }

  private toolCallSignature(call: OperationResult['toolCalls'][number]): string {
    if (call.tool === 'file-system') {
      return `file-system:${String(call.input.action ?? '')}:${String(call.input.path ?? '')}`;
    }
    const keys = Object.keys(call.input).sort();
    const normalized = Object.fromEntries(keys.map((key) => [key, call.input[key]]));
    return `${call.tool}:${JSON.stringify(normalized)}`;
  }

  private async evaluateToolRound(state: PlanExecutionState, step: PlanStep): Promise<boolean> {
    const toolContext = state.execution.getToolContext();
    if (toolContext.length === 0) return false;

    // Persist concrete tool evidence BEFORE asking the LLM evaluator what it means.
    // Previously an unsatisfied evaluator response could return evidence: [], which meant
    // the next attempt effectively forgot the successful tool round and displayed
    // "accumulated evidence 0" forever. Raw payloads are short-lived, normalized
    // evidence is the durable representation carried between attempts.
    const previous = state.stepResults.get(step.id);
    const normalizedEvidence = this.normalizeToolEvidence(toolContext);
    const normalizedRound: StepResult = {
      goalSatisfied: false,
      findings: [],
      evidence: normalizedEvidence,
      missing: previous?.missing ?? [],
      facts: [],
    };
    const accumulated = this.mergeStepResults(previous, normalizedRound);
    state.stepResults.set(step.id, accumulated);

    this.reporter.evidenceCheck(step.goal, toolContext.length, accumulated.evidence.length);
    const startedAt = Date.now();
    const decision = await this.recoveryController.assessToolEvidence({
      task: state.task,
      execution: state.execution,
      step,
      toolContext,
      accumulated,
      knownFacts: state.executionContext.all(),
    });
    this.reporter.evidenceCheckResult(decision.satisfied, decision.reason, decision.missing, Date.now() - startedAt);

    const evaluated: StepResult = {
      goalSatisfied: decision.satisfied,
      findings: decision.findings.length > 0
        ? decision.findings
        : decision.reason.startsWith('Evidence evaluation failed') ? [] : [decision.reason],
      evidence: decision.evidence,
      missing: decision.satisfied ? [] : decision.missing,
      facts: decision.satisfied
        ? decision.facts.map((fact) => ({ key: fact.key, value: fact.value, evidence: decision.evidence }))
        : [],
    };
    const merged = this.mergeStepResults(accumulated, evaluated);
    state.stepResults.set(step.id, merged);

    if (decision.satisfied) {
      const mergedKeys = state.executionContext.mergeStepResult(step, merged);
      this.reporter.factsMerged(mergedKeys);
      this.reporter.stepResult(merged);
      state.execution.setToolContext([], 0);
      this.completeStep(state, step, 'tool-evidence-satisfied');
      return true;
    }

    this.recordStepProgress(state, step.id, merged);
    state.retryReason = decision.missing.length > 0
      ? `после проверки evidence не хватает: ${decision.missing.slice(0, 2).join('; ')}`
      : 'после проверки evidence цель шага ещё не подтверждена';
    return false;
  }

  private normalizeToolEvidence(toolContext: ToolContextEntry[]): StepResult['evidence'] {
    const evidence: StepResult['evidence'] = [];
    const push = (item: StepResult['evidence'][number]): void => {
      const fact = item.fact.trim();
      if (!fact) return;
      const key = `${item.path ?? ''}|${item.symbol ?? ''}|${fact}`;
      if (evidence.some((candidate) => `${candidate.path ?? ''}|${candidate.symbol ?? ''}|${candidate.fact}` === key)) return;
      evidence.push({ ...item, fact });
    };
    const compact = (value: unknown, limit = 900): string => {
      let text: string;
      if (typeof value === 'string') text = value;
      else {
        try { text = JSON.stringify(value); } catch { text = String(value); }
      }
      return text.replace(/\r/g, '').trim().slice(0, limit);
    };

    for (const entry of toolContext) {
      const input = entry.call.input ?? {};
      const tool = entry.call.tool;
      if (!entry.result.ok) {
        push({
          path: typeof input.path === 'string' ? input.path : undefined,
          fact: `${tool} failed: ${entry.result.error ?? 'unknown error'}`,
        });
        continue;
      }

      if (tool === 'search' && Array.isArray(entry.result.data)) {
        for (const match of entry.result.data.slice(0, 12)) {
          if (!match || typeof match !== 'object') continue;
          const item = match as Record<string, unknown>;
          const path = typeof item.path === 'string' ? item.path : undefined;
          const line = typeof item.line === 'number' ? `:${item.line}` : '';
          const text = typeof item.text === 'string' ? item.text.trim() : compact(item, 500);
          push({ path, fact: `Search match${line}: ${text}` });
        }
        if (entry.result.data.length === 0) {
          push({
            path: typeof input.path === 'string' ? input.path : undefined,
            fact: `Search for ${JSON.stringify(String(input.query ?? ''))} returned no matches.`,
          });
        }
        continue;
      }

      if (tool === 'file-system') {
        const action = String(input.action ?? '');
        const path = typeof input.path === 'string' ? input.path : undefined;
        if (action === 'read') {
          push({ path, fact: `File read succeeded. Content excerpt:
${compact(entry.result.data, 1800)}` });
        } else if (action === 'list') {
          push({ path, fact: `Directory listing: ${compact(entry.result.data, 1200)}` });
        } else {
          push({ path, fact: `file-system ${action || 'operation'} succeeded: ${compact(entry.result.data, 700)}` });
        }
        continue;
      }

      push({
        path: typeof input.path === 'string' ? input.path : undefined,
        fact: `${tool} succeeded: ${compact(entry.result.data, 1000)}`,
      });
    }

    return evidence.slice(0, 20);
  }

  private activeEvidence(result?: StepResult): { findings: string[]; evidence: StepResult['evidence']; missing: string[] } {
    return {
      findings: result?.findings ?? [],
      evidence: result?.evidence ?? [],
      missing: result?.missing ?? [],
    };
  }

  private async trySemanticSatisfaction(state: PlanExecutionState, step: PlanStep, facts: ExecutionFact[]): Promise<boolean> {
    if (!this.canUseSemanticSatisfaction(step, facts)) return false;

    this.reporter.semanticCheck(step.goal, facts.map((fact) => fact.key));
    const startedAt = Date.now();
    const decision = await this.recoveryController.assessStepSatisfaction({
      task: state.task,
      execution: state.execution,
      step,
      facts,
      accumulated: state.stepResults.get(step.id),
    });
    this.reporter.semanticCheckResult(decision.satisfied, decision.reason, decision.missing, Date.now() - startedAt);
    if (!decision.satisfied) return false;

    const evidence = facts.flatMap((fact) => fact.evidence).slice(0, 20);
    const derived: StepResult = {
      goalSatisfied: true,
      findings: [decision.reason],
      evidence,
      missing: [],
      facts: decision.facts.map((fact) => ({ ...fact, evidence })),
    };
    state.stepResults.set(step.id, this.mergeStepResults(state.stepResults.get(step.id), derived));
    const mergedKeys = state.executionContext.mergeStepResult(step, derived);
    this.reporter.factsMerged(mergedKeys);
    this.completeStep(state, step, 'semantic-postcondition-satisfied');
    return true;
  }

  private async tryPruneRecoveryBranch(state: PlanExecutionState, parentStepId: string): Promise<boolean> {
    const parent = state.plan.steps.find((step) => step.id === parentStepId);
    if (!parent || parent.status === 'completed') return false;

    if (this.outputsAlreadySatisfied(state, parent)) {
      const pruned = this.markRecoveryChildrenCompleted(state.plan, parentStepId);
      if (pruned > 0) this.reporter.recoveryPruned(parent.goal, pruned, parent.outputs);
      return pruned > 0;
    }

    const availableFacts = state.executionContext.select(parent.inputs);
    if (availableFacts.length === 0 || !this.canUseSemanticSatisfaction(parent, availableFacts, true)) return false;

    this.reporter.semanticCheck(parent.goal, availableFacts.map((fact) => fact.key), true);
    const startedAt = Date.now();
    const decision = await this.recoveryController.assessStepSatisfaction({
      task: state.task,
      execution: state.execution,
      step: parent,
      facts: availableFacts,
      accumulated: state.stepResults.get(parent.id),
    });
    this.reporter.semanticCheckResult(decision.satisfied, decision.reason, decision.missing, Date.now() - startedAt, true);
    if (!decision.satisfied) return false;

    const evidence = availableFacts.flatMap((fact) => fact.evidence).slice(0, 20);
    const derived: StepResult = {
      goalSatisfied: true,
      findings: [decision.reason],
      evidence,
      missing: [],
      facts: decision.facts.map((fact) => ({ ...fact, evidence })),
    };
    state.stepResults.set(parent.id, this.mergeStepResults(state.stepResults.get(parent.id), derived));
    const mergedKeys = state.executionContext.mergeStepResult(parent, derived);
    this.reporter.factsMerged(mergedKeys);
    const pruned = this.markRecoveryChildrenCompleted(state.plan, parentStepId);
    this.reporter.recoveryPruned(parent.goal, pruned, parent.outputs);
    return pruned > 0;
  }

  private canUseSemanticSatisfaction(step: PlanStep, facts: ExecutionFact[], recoveryBranch = false): boolean {
    if (step.type !== 'search' && step.type !== 'understand') return false;
    if (step.outputs.length === 0 || facts.length === 0) return false;
    if (step.outputs.every((key) => facts.some((fact) => fact.key === key))) return false;

    // `understand` is a derivation step: when its declared inputs are already present,
    // let the small semantic gate derive the requested outputs before asking the main
    // operation to read the same project files again. Search remains evidence-driven.
    if (step.type === 'understand') return step.inputs.every((key) => facts.some((fact) => fact.key === key));
    if (recoveryBranch) return true;
    return step.id.startsWith('recovery-') || facts.some((fact) => fact.producerStepId.startsWith('recovery-'));
  }

  private markRecoveryChildrenCompleted(plan: TaskPlan, parentStepId: string): number {
    let pruned = 0;
    for (const step of plan.steps) {
      if (step.recoveryForStepId !== parentStepId || step.status === 'completed') continue;
      step.status = 'completed';
      pruned += 1;
    }
    return pruned;
  }

  private humanRecoveryReason(reason: string, result?: StepResult): string {
    if (reason === 'step-attempt-budget') {
      const missing = result?.missing ?? [];
      return missing.length > 0
        ? `исчерпан лимит попыток; не хватает: ${missing.slice(0, 3).join('; ')}`
        : 'исчерпан лимит попыток шага';
    }
    if (reason === 'step-goal-not-satisfied') {
      const missing = result?.missing ?? [];
      return missing.length > 0
        ? `цель шага не подтверждена; не хватает: ${missing.slice(0, 3).join('; ')}`
        : 'цель шага не подтверждена после всех попыток';
    }
    if (reason === 'step-no-progress') {
      const missing = result?.missing ?? [];
      return missing.length > 0
        ? `повторные попытки не дали новых данных; всё ещё не хватает: ${missing.slice(0, 3).join('; ')}`
        : 'повторные попытки не изменили найденные факты или evidence';
    }
    if (reason.startsWith('missing-inputs:')) return `отсутствуют входные факты: ${reason.slice('missing-inputs:'.length)}`;
    if (reason.startsWith('model-error:')) return `ошибка вызова модели: ${reason.slice('model-error:'.length)}`;
    return reason;
  }

  private outputsAlreadySatisfied(state: PlanExecutionState, step: PlanStep): boolean {
    if (step.type === 'prepare-change' || step.type === 'finalize') return false;
    return step.outputs.length > 0 && step.outputs.every((key) => state.executionContext.has(key));
  }

  private ensureUniqueStepIds(plan: TaskPlan, steps: PlanStep[]): void {
    const used = new Set(plan.steps.map((step) => step.id));
    for (const step of steps) {
      const base = step.id || 'recovery';
      let candidate = base;
      let suffix = 2;
      while (used.has(candidate)) {
        candidate = `${base}-${suffix}`;
        suffix += 1;
      }
      step.id = candidate;
      used.add(candidate);
    }
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


  private mergeStepResults(previous: StepResult | undefined, current: StepResult): StepResult {
    if (!previous) return current;
    const uniqueStrings = (values: string[]) => Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 12);
    const evidenceKey = (item: { path?: string; symbol?: string; fact: string }) => `${item.path ?? ''}|${item.symbol ?? ''}|${item.fact}`;
    const evidence = [...previous.evidence, ...current.evidence].filter((item, index, all) => all.findIndex((candidate) => evidenceKey(candidate) === evidenceKey(item)) === index).slice(0, 20);
    const factKey = (item: { key: string; value: string }) => `${item.key}|${item.value}`;
    const facts = [...previous.facts, ...current.facts].filter((item, index, all) => all.findIndex((candidate) => factKey(candidate) === factKey(item)) === index).slice(0, 20);
    return {
      goalSatisfied: previous.goalSatisfied || current.goalSatisfied,
      targets: uniqueStrings([...(previous.targets ?? []), ...(current.targets ?? [])]),
      findings: uniqueStrings([...previous.findings, ...current.findings]),
      evidence,
      missing: current.missing,
      facts,
    };
  }

  private expandEditFileSteps(state: PlanExecutionState, targets: string[]): void {
    const editIndex = state.plan.steps.findIndex((candidate, index) => index > state.planIndex && candidate.type === 'edit-file');
    if (editIndex < 0) return;
    const original = state.plan.steps[editIndex];
    const uniqueTargets = Array.from(new Set(targets.map((target) => target.trim()).filter(Boolean)));
    if (uniqueTargets.length === 0) return;

    if (uniqueTargets.length === 1) {
      original.targetPath = uniqueTargets[0];
      original.goal = `${original.goal} (${uniqueTargets[0]})`;
      state.plan.version += 1;
      return;
    }

    const replacements: PlanStep[] = [];
    let previousOutput: string | undefined;
    uniqueTargets.forEach((targetPath, index) => {
      const isLast = index === uniqueTargets.length - 1;
      const syntheticOutput = isLast ? original.outputs : [`${original.id}.file-${index + 1}.applied`];
      const inputs = [...original.inputs];
      if (previousOutput && !inputs.includes(previousOutput)) inputs.push(previousOutput);
      replacements.push({
        ...original,
        id: `${original.id}.${index + 1}`,
        goal: `${original.goal} (${targetPath})`,
        status: 'pending',
        targetPath,
        inputs,
        outputs: syntheticOutput,
      });
      previousOutput = syntheticOutput[0];
    });

    state.plan.steps.splice(editIndex, 1, ...replacements);
    state.plan.version += 1;
    this.reporter.planUpdated(state.plan, editIndex, replacements.length - 1);
  }


  private recordStepProgress(state: PlanExecutionState, stepId: string, result?: StepResult): void {
    if (!result) return;
    const signature = this.stepProgressSignature(result);
    const map = state.stepProgress ?? (state.stepProgress = new Map());
    const history = map.get(stepId) ?? [];
    history.push(signature);
    map.set(stepId, history.slice(-3));
  }

  private hasRepeatedStepProgress(state: PlanExecutionState, stepId: string): boolean {
    const history = state.stepProgress?.get(stepId) ?? [];
    if (history.length < 2) return false;
    return history[history.length - 1] === history[history.length - 2];
  }

  private stepProgressSignature(result: StepResult): string {
    const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
    const findings = result.findings.map(normalize).sort();
    const missing = result.missing.map(normalize).sort();
    const evidence = result.evidence
      .map((item) => normalize(`${item.path ?? ''}|${item.symbol ?? ''}|${item.fact}`))
      .sort();
    const facts = result.facts.map((fact) => normalize(`${fact.key}|${fact.value}`)).sort();
    return JSON.stringify({ findings, missing, evidence, facts });
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

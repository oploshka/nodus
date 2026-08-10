// PlanExecutor.ts
import type { ChangeExecutor } from '@agent/Execution/ChangeExecutor';
import type { ToolExecutor } from '@agent/Execution/ToolExecutor';
import type { HumanInteraction } from '@agent/Human/HumanInteraction';
import type { PlanUpdater } from '@agent/Planning/PlanUpdater';
import type { RecoveryController, RecoveryDecision } from '@agent/Planning/RecoveryController';
import type { PlanStep, StepRequirementContract, TaskPlan } from '@agent/Planning/TaskPlan';
import { SearchRequestCompiler } from '@agent/Planning/SearchRequestCompiler';
import { RetrievalResultClassifier } from '@agent/Planning/RetrievalResult';
import { ChangeDefinitionCompiler } from '@agent/Planning/ChangeDefinitionCompiler';
import { FinalResultCompiler } from '@agent/Planning/FinalResultCompiler';
import { RequirementConstraintValidator } from '@agent/Planning/RequirementConstraintValidator';
import type { RequirementResolutionPlanner } from '@agent/Planning/RequirementResolutionPlanner';
import { parseWorkflowDataRef } from '@agent/Planning/WorkflowData';
import { ExecutionContext } from '@agent/Planning/ExecutionContext';
import { ContextComposer } from '@agent/Planning/ContextComposer';
import type { ExecutionReporter } from '@agent/Reporting/ExecutionReporter';
import type { Conversation } from '@core/Conversation/Conversation';
import type { Execution, ToolContextEntry } from '@core/Execution/Execution';
import type { LogContext } from '@core/Logging/Log';
import type { Logger } from '@core/Logging/Logger';
import type { Task } from '@core/Task/Task';
import type { ModelController } from '@model/Controller/ModelController';
import { ModelTransportError } from '@model/Adapter/OpenAICompatibleModelAdapter';
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
  understandToolContext?: Map<string, ToolContextEntry[]>;
  understandContinuation?: { stepId: string; toolRounds: number };
  resumes: number;
  startedAt: number;
  pauseReason?: string;
  retryReason?: string;
  requirementResolutionAttempts?: Map<string, number>;
  requirementRechecks?: Set<string>;
}

export type PlanRunResult = 'finished' | 'paused';

export class PlanExecutor {
  public static readonly MAX_RESUMES = 3;
  private readonly contextComposer = new ContextComposer();
  private readonly searchRequestCompiler = new SearchRequestCompiler();
  private readonly retrievalClassifier = new RetrievalResultClassifier();
  private readonly changeDefinitionCompiler = new ChangeDefinitionCompiler();
  private readonly finalResultCompiler = new FinalResultCompiler();
  private readonly requirementConstraintValidator = new RequirementConstraintValidator();
  private static readonly SAFETY_NODE_EXECUTIONS = 50;
  private static readonly MAX_UNDERSTAND_TOOL_ROUNDS = 3;

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
    private readonly requirementResolutionPlanner?: RequirementResolutionPlanner,
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
        const rechecked = this.consumeRequirementRecheck(state, step);
        if (rechecked.length > 0) this.reporter.requirementRechecked(rechecked, true);
        this.reporter.stepAlreadySatisfiedAt(state.planIndex, state.plan.steps.length, step.goal, step.type, step.outputs);
        this.completeStep(state, step, rechecked.length > 0 ? 'requirement-rechecked' : 'outputs-already-satisfied');
        continue;
      }

      const composed = this.contextComposer.compose(state.executionContext, step);

      if (composed.missingInputs.length > 0) {
        const blocked: StepResult = {
          goalSatisfied: false,
          findings: [],
          evidence: [],
          missing: composed.missingInputs,
          facts: [],
        };
        state.stepResults.set(step.id, this.mergeStepResults(state.stepResults.get(step.id), blocked));
        const missingRequirement = composed.missingInputs.find((key) => this.isWorkflowDataRef(key));
        if (missingRequirement && await this.resolveRequirement(state, step, missingRequirement, blocked)) continue;
        const recovered = await this.recover(state, `missing-inputs:${composed.missingInputs.join(',')}`);
        if (!recovered) return state.pauseReason ? 'paused' : 'finished';
        continue;
      }
      const understandContinuation = step.type === 'understand' && state.understandContinuation?.stepId === step.id;
      if (!understandContinuation && state.stepAttempts >= step.maxAttempts) {
        const reason = this.hasRepeatedStepProgress(state, step.id) ? 'step-no-progress' : 'step-attempt-budget';
        const recovered = await this.recover(state, reason);
        if (!recovered) return state.pauseReason ? 'paused' : 'finished';
        continue;
      }

      const displayedAttempt = understandContinuation
        ? Math.max(state.stepAttempts, 1)
        : state.stepAttempts + 1;
      if (understandContinuation) {
        this.reporter.stepContinuation(state.planIndex, step.type, state.understandContinuation?.toolRounds ?? 0);
      } else {
        this.reporter.planStep(
          state.planIndex,
          state.plan.steps.length,
          step.goal,
          step.type,
          displayedAttempt,
          step.maxAttempts,
          state.retryReason,
        );
      }
      state.retryReason = undefined;
      this.reporter.contextCompose(step.inputs, composed.facts.map((fact) => fact.key), composed.missingInputs);

      if (!understandContinuation) state.stepAttempts += 1;
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
        continuation: understandContinuation,
        toolRound: understandContinuation ? state.understandContinuation?.toolRounds : 0,
      });
      await this.logger.info('plan-step-started', {
        planIndex: state.planIndex,
        stepId: step.id,
        type: step.type,
        goal: step.goal,
        attempt: state.stepAttempts,
        continuation: understandContinuation,
        toolRound: understandContinuation ? state.understandContinuation?.toolRounds : 0,
      }, context);
      const operation = this.operationRegistry.get(step.type);
      if (!operation) {
        const recovered = await this.recover(state, `operation-not-available:${step.type}`);
        if (!recovered) return state.pauseReason ? 'paused' : 'finished';
        continue;
      }

      // Typed evidence requirements use deterministic retrieval first. The model is only a
      // fallback for legacy/untyped search steps where Nodus cannot compile a useful query.
      if (step.type === 'search' && this.searchRequestCompiler.supportsDeterministicRequirement(step)) {
        const searchOutcome = await this.executeCompiledSearch(state, step, context);
        if (searchOutcome === 'completed') continue;
        if (searchOutcome === 'unresolved') {
          const unresolved = state.stepResults.get(step.id);
          const requirement = step.outputs.find((output) => this.isWorkflowDataRef(output));
          if (requirement && await this.resolveRequirement(state, step, requirement, unresolved)) continue;
          const recovered = await this.recover(state, unresolved?.retrieval?.match === 'related' ? 'search-related-only' : 'search-missing');
          if (!recovered) return state.pauseReason ? 'paused' : 'finished';
          continue;
        }
      }

      // Fast path: a change-definition with a known target and complete semantic facts is a
      // deterministic compilation task, not another reasoning call.
      if (step.type === 'prepare-change') {
        const compiled = this.changeDefinitionCompiler.compile(step, composed.facts);
        if (compiled) {
          const merged = this.mergeStepResults(state.stepResults.get(step.id), compiled);
          state.stepResults.set(step.id, merged);
          const mergedKeys = state.executionContext.mergeStepResult(step, merged);
          this.reporter.factsMerged(mergedKeys);
          this.reporter.stepResult(merged);
          this.reporter.deterministicStep(step.type, 'change-definition compiled from established facts');
          this.expandEditFileSteps(state, merged.targets ?? []);
          this.completeStep(state, step, 'deterministic-change-definition');
          continue;
        }
      }

      // Fast path: after a concrete change/review/verification result, finalization can be
      // assembled from execution state without paying for another model response.
      if (step.type === 'finalize') {
        const compiled = this.finalResultCompiler.compile(step, state.task, state.execution, state.executionContext);
        if (compiled) {
          const merged = this.mergeStepResults(state.stepResults.get(step.id), compiled.stepResult);
          state.stepResults.set(step.id, merged);
          const mergedKeys = state.executionContext.mergeStepResult(step, merged);
          this.reporter.factsMerged(mergedKeys);
          this.reporter.deterministicStep(step.type, 'final result compiled from execution state');
          state.execution.status = 'completed';
          state.execution.result = compiled.answer;
          step.status = 'completed';
          state.execution.addEvent('plan-step-completed', { stepId: step.id, type: step.type, reason: 'deterministic-finalize' });
          return 'finished';
        }
      }

      if (step.type === 'edit-file') {
        await this.ensureEditFileTargetContext(state, step, context);
      }
      if (step.type === 'understand') {
        this.restoreUnderstandToolContext(state, step);
      }

      let result: OperationResult;
      try {
        result = await this.modelController.execute({
          task: state.task,
          execution: state.execution,
          conversation: state.conversation,
          operation,
          activeStep: { id: step.id, type: step.type, action: step.action, subject: step.subject, goal: step.goal, attempt: state.stepAttempts, maxAttempts: step.maxAttempts, inputs: step.inputs, outputs: step.outputs, targetPath: step.targetPath, sourceHints: step.sourceHints, requirements: step.requirements?.map(({ ref, description, constraints }) => ({ ref, description, constraints })) },
          stepContext: {
            ...composed,
            activeEvidence: this.activeEvidence(state.stepResults.get(step.id)),
          },
        });
      } catch (error) {
        await this.logger.error('model-error', { operation: step.type, error: String(error) }, context);
        state.execution.addEvent('model-error', { operation: step.type, error: String(error) });
        if (error instanceof ModelTransportError) {
          this.pause(
            state,
            `step:${step.id}:model-transport-error`,
            `Модель недоступна: ${error.message}. Проверьте model.endpoint и запустите model-server, затем продолжите выполнение.`,
          );
          return 'paused';
        }
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
        const validated = this.requirementConstraintValidator.validate(step, result.stepResult);
        result = { ...result, stepResult: validated };
        const merged = this.mergeStepResults(state.stepResults.get(step.id), validated);
        state.stepResults.set(step.id, merged);
        const mergedKeys = state.executionContext.mergeStepResult(step, merged);
        this.reporter.factsMerged(mergedKeys);
        this.reporter.stepResult(merged);
      }

      if (step.type === 'search') {
        const modelQueries = [
          ...this.searchRequestCompiler.queriesFromModelData(result.data),
          ...this.searchRequestCompiler.queriesFromLegacyToolCalls(result.toolCalls),
        ];
        if (result.status !== 'failed' && modelQueries.length > 0) {
          const searchOutcome = await this.executeCompiledSearch(state, step, context, modelQueries);
          if (searchOutcome === 'completed') continue;
          if (searchOutcome === 'unresolved') {
            const unresolved = state.stepResults.get(step.id);
            const requirement = step.outputs.find((output) => this.isWorkflowDataRef(output));
            if (requirement && await this.resolveRequirement(state, step, requirement, unresolved)) continue;
          }
        }

        // Never execute raw model-generated search tool calls. The model may suggest only
        // lexical queries; Nodus owns tool selection, field names, paths, and limits.
        const recovered = await this.recover(
          state,
          result.status === 'failed'
            ? result.message ?? 'search query generation failed'
            : 'search-no-concrete-result',
        );
        if (!recovered) return state.pauseReason ? 'paused' : 'finished';
        continue;
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
        if (step.type === 'edit-file') {
          // edit-file is intentionally tool-free. The runtime already preloads the exact
          // target source and prepare-change supplies the required logical facts. A tool
          // request here is therefore protocol drift, not a reason to start another read loop.
          state.retryReason = `целевой файл ${step.targetPath ?? ''} уже предоставлен модели; edit-file не выполняет инструменты`;
          continue;
        }

        let toolCalls = result.toolCalls;
        if (step.type === 'understand') {
          const currentToolRounds = state.understandContinuation?.stepId === step.id
            ? state.understandContinuation.toolRounds
            : 0;
          const supplied = new Set((state.understandToolContext?.get(step.id) ?? [])
            .map((entry) => this.toolCallSignature(entry.call)));
          toolCalls = toolCalls.filter((call) => !supplied.has(this.toolCallSignature(call)));
          const declaredSourcesComplete = (step.sourceHints?.length ?? 0) > 0
            && step.sourceHints?.every((path) => supplied.has(this.toolCallSignature({
              tool: 'file-system',
              input: { action: 'read', path },
            })));
          if (declaredSourcesComplete) toolCalls = [];
          if (toolCalls.length === 0) {
            state.retryReason = declaredSourcesComplete
              ? 'все заявленные исходники уже предоставлены; требуется сформировать результат анализа'
              : 'модель повторно запросила уже предоставленный исходный файл';
            state.understandContinuation = currentToolRounds >= PlanExecutor.MAX_UNDERSTAND_TOOL_ROUNDS
              ? undefined
              : { stepId: step.id, toolRounds: currentToolRounds + 1 };
            continue;
          }
          if (currentToolRounds >= PlanExecutor.MAX_UNDERSTAND_TOOL_ROUNDS) {
            state.understandContinuation = undefined;
            state.retryReason = `исчерпан лимит внутренних чтений (${PlanExecutor.MAX_UNDERSTAND_TOOL_ROUNDS}) в одной попытке анализа`;
            continue;
          }
        }
        const summary = step.type === 'understand'
          ? await this.toolExecutor.execute(toolCalls, state.execution, context, 3)
          : await this.toolExecutor.execute(toolCalls, state.execution, context);
        this.reporter.tools(summary.executed);

        // Understand owns semantic interpretation itself. Tool results are preserved
        // as compact evidence and the raw requested source is sent directly into the next
        // understand model call. No second LLM evaluator is inserted between read -> model.
        if (step.type === 'understand') {
          const currentToolRounds = state.understandContinuation?.stepId === step.id
            ? state.understandContinuation.toolRounds
            : 0;
          this.retainUnderstandToolContext(state, step);
          this.recordUnderstandToolRound(state, step);
          state.understandContinuation = { stepId: step.id, toolRounds: currentToolRounds + 1 };
          state.retryReason = `получены запрошенные данные (${summary.executed} инструментов)`;
          continue;
        }

        const currentResult = state.stepResults.get(step.id);
        const missing = currentResult?.missing ?? [];
        state.retryReason = missing.length > 0
          ? `нужны дополнительные данные: ${missing.slice(0, 2).join('; ')}`
          : `модель запросила дополнительные данные (${result.toolCalls.length} инструментов)`;
        continue;
      }

      if (step.type === 'understand') {
        state.understandContinuation = undefined;
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
        const missingRequirement = this.missingRequirementRef(step, mergedResult);
        if (missingRequirement && await this.resolveRequirement(state, step, missingRequirement, mergedResult)) {
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
    state.understandContinuation = undefined;
    state.understandToolContext?.delete(step.id);
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
    if (state.understandContinuation?.stepId === step.id) state.understandContinuation = undefined;
    state.understandToolContext?.delete(step.id);
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
      state.understandContinuation = undefined;
      state.understandToolContext?.delete(current.id);
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
      state.understandContinuation = undefined;
      state.understandToolContext?.delete(current.id);
      state.retryReason = undefined;
      this.reporter.planUpdated(state.plan, state.planIndex, freshSteps.length);
      return true;
    }
    if (decision.action === 'skip-current') {
      current.status = 'completed';
      state.planIndex += 1;
      state.stepAttempts = 0;
      state.understandContinuation = undefined;
      state.understandToolContext?.delete(current.id);
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


  private retainUnderstandToolContext(state: PlanExecutionState, step: PlanStep): void {
    const latest = state.execution.getToolContext();
    if (latest.length === 0) return;
    const cache = state.understandToolContext ?? (state.understandToolContext = new Map());
    const existing = cache.get(step.id) ?? [];
    const merged = [...existing, ...latest].filter((entry, index, all) => (
      all.findIndex((candidate) => this.toolCallSignature(candidate.call) === this.toolCallSignature(entry.call)) === index
    ));
    cache.set(step.id, merged);
    state.execution.setToolContext(merged, 1);
  }

  private restoreUnderstandToolContext(state: PlanExecutionState, step: PlanStep): void {
    const cached = state.understandToolContext?.get(step.id);
    if (!cached || cached.length === 0) return;
    state.execution.setToolContext(cached, 1);
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
  }

  private async executeCompiledSearch(
    state: PlanExecutionState,
    step: PlanStep,
    context: LogContext,
    preferredQueries: string[] = [],
  ): Promise<'completed' | 'unresolved' | 'not-run'> {
    const request = this.searchRequestCompiler.compile(step, preferredQueries);
    if (request.exact.length === 0 && request.related.length === 0) return 'not-run';

    let exactEntries: ToolContextEntry[] = [];
    let relatedEntries: ToolContextEntry[] = [];

    if (request.exact.length > 0) {
      const summary = await this.toolExecutor.execute(request.exact, state.execution, context, 5);
      this.reporter.tools(summary.executed);
      exactEntries = [...state.execution.getToolContext()];
    }

    let assessment = this.retrievalClassifier.classify(exactEntries, []);
    if (assessment.match !== 'exact' && request.related.length > 0) {
      const summary = await this.toolExecutor.execute(request.related, state.execution, context, 5);
      this.reporter.tools(summary.executed);
      relatedEntries = [...state.execution.getToolContext()];
      assessment = this.retrievalClassifier.classify(exactEntries, relatedEntries);
    }

    const allEntries = [...exactEntries, ...relatedEntries];
    return this.completeSearchToolRound(state, step, assessment.match, assessment.reason, allEntries)
      ? 'completed'
      : 'unresolved';
  }

  private toolCallSignature(call: OperationResult['toolCalls'][number]): string {
    if (call.tool === 'file-system') {
      return `file-system:${String(call.input.action ?? '')}:${String(call.input.path ?? '')}`;
    }
    const keys = Object.keys(call.input).sort();
    const normalized = Object.fromEntries(keys.map((key) => [key, call.input[key]]));
    return `${call.tool}:${JSON.stringify(normalized)}`;
  }

  private completeSearchToolRound(
    state: PlanExecutionState,
    step: PlanStep,
    match: 'exact' | 'related' | 'missing',
    reason: string,
    toolContext: ToolContextEntry[],
  ): boolean {
    const previous = state.stepResults.get(step.id);
    const normalizedEvidence = this.normalizeToolEvidence(toolContext);
    const requirement = step.outputs[0];
    const exact = match === 'exact';
    const round: StepResult = {
      goalSatisfied: exact,
      findings: [
        match === 'exact'
          ? `Exact retrieval satisfied ${requirement ?? step.subject ?? step.goal}.`
          : match === 'related'
            ? `Related project evidence was found, but it does not satisfy ${requirement ?? step.subject ?? step.goal}.`
            : `No project evidence satisfied ${requirement ?? step.subject ?? step.goal}.`,
      ],
      evidence: normalizedEvidence,
      missing: exact ? [] : step.outputs.length > 0 ? [...step.outputs] : [step.subject ?? step.goal],
      facts: exact
        ? step.outputs.map((key) => ({
            key,
            value: this.searchResultValue(step, normalizedEvidence),
            evidence: normalizedEvidence,
          }))
        : [],
      retrieval: { match, requirement, reason },
    };
    const merged = this.mergeStepResults(previous, round);
    state.stepResults.set(step.id, merged);
    this.reporter.retrieval(match, requirement ?? step.subject ?? step.goal, reason);
    this.reporter.stepResult(merged);
    state.execution.setToolContext([], 0);

    if (!exact) {
      this.recordStepProgress(state, step.id, merged);
      return false;
    }

    const mergedKeys = state.executionContext.mergeStepResult(step, merged);
    this.reporter.factsMerged(mergedKeys);
    const rechecked = this.consumeRequirementRecheck(state, step);
    if (rechecked.length > 0) this.reporter.requirementRechecked(rechecked, true);
    this.completeStep(state, step, rechecked.length > 0 ? 'requirement-rechecked' : 'deterministic-search-exact');
    return true;
  }

  private searchResultValue(step: PlanStep, evidence: StepResult['evidence']): string {
    const paths = Array.from(new Set(evidence.map((item) => item.path).filter((path): path is string => Boolean(path))));
    if (step.action === 'find-files' && paths.length > 0) return paths.slice(0, 12).join(', ');
    const compact = evidence.slice(0, 8).map((item) => {
      const location = [item.path, item.symbol].filter(Boolean).join('#');
      return location ? `${location}: ${item.fact}` : item.fact;
    });
    return compact.join(' | ').slice(0, 1800) || `Search completed for ${step.subject ?? step.goal}`;
  }

  private recordUnderstandToolRound(state: PlanExecutionState, step: PlanStep): void {
    const toolContext = state.execution.getToolContext();
    if (toolContext.length === 0) return;

    const previous = state.stepResults.get(step.id);
    const normalizedRound: StepResult = {
      goalSatisfied: false,
      findings: [],
      evidence: this.normalizeToolEvidence(toolContext),
      // A successful requested read addresses the previous round's transient missing
      // request. The next understand call decides whether anything else is missing.
      missing: [],
      facts: [],
    };
    state.stepResults.set(step.id, this.mergeStepResults(previous, normalizedRound));
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
          // Raw source is transient tool context. Durable evidence keeps only the source
          // reference; semantic facts extracted from that source are stored separately.
          push({ path, fact: 'File read succeeded; full source kept only in immediate tool context.' });
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

  private async tryPruneRecoveryBranch(state: PlanExecutionState, parentStepId: string): Promise<boolean> {
    const parent = state.plan.steps.find((step) => step.id === parentStepId);
    if (!parent || parent.status === 'completed') return false;

    // Recovery pruning is also deterministic now: prune only when the parent's exact
    // output postconditions already exist. Do not ask a second LLM to reinterpret sibling facts.
    if (!this.outputsAlreadySatisfied(state, parent)) return false;

    const pruned = this.markRecoveryChildrenCompleted(state.plan, parentStepId);
    if (pruned > 0) this.reporter.recoveryPruned(parent.goal, pruned, parent.outputs);
    return pruned > 0;
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

  private async resolveRequirement(
    state: PlanExecutionState,
    parentStep: PlanStep,
    requirementRef: string,
    currentResult?: StepResult,
  ): Promise<boolean> {
    if (!this.requirementResolutionPlanner || !this.isWorkflowDataRef(requirementRef)) return false;

    const depth = parentStep.resolutionDepth ?? 0;
    if (depth >= 2) return false;

    const attempts = state.requirementResolutionAttempts ?? (state.requirementResolutionAttempts = new Map());
    const count = attempts.get(requirementRef) ?? 0;
    if (count >= 2) return false;

    const requirement = this.requirementContract(state.plan, parentStep, requirementRef);
    if (!requirement) return false;

    attempts.set(requirementRef, count + 1);
    const planned = await this.requirementResolutionPlanner.plan({
      task: state.task,
      executionId: state.execution.id,
      parentStep,
      requirement,
      evidence: currentResult?.evidence ?? [],
      facts: state.executionContext.all(),
      depth: depth + 1,
    });
    if (!planned || planned.plan.steps.length === 0) return false;

    const childSteps = planned.plan.steps.map((step) => ({
      ...step,
      status: 'pending' as const,
      inputs: [...step.inputs],
      outputs: [...step.outputs],
      requirements: step.requirements?.map((item) => ({
        ...item,
        constraints: item.constraints ? [...item.constraints] : undefined,
        sourceHints: item.sourceHints ? [...item.sourceHints] : undefined,
      })),
      resolutionForStepId: parentStep.id,
      resolutionForRequirement: requirementRef,
      resolutionDepth: depth + 1,
    }));
    this.ensureUniqueStepIds(state.plan, childSteps);

    const rechecks = state.requirementRechecks ?? (state.requirementRechecks = new Set());
    rechecks.add(`${parentStep.id}|${requirementRef}`);
    parentStep.status = 'pending';
    this.planUpdater.insertBefore(state.plan, state.planIndex, childSteps);
    this.planUpdater.markPendingFrom(state.plan, state.planIndex);
    state.stepAttempts = 0;
    state.retryReason = undefined;
    state.understandContinuation = undefined;
    state.understandToolContext?.delete(parentStep.id);
    this.reporter.requirementResolution(requirementRef, planned.reason, childSteps.length, depth + 1, planned.mode);
    this.reporter.planUpdated(state.plan, state.planIndex, childSteps.length);
    return true;
  }

  private requirementContract(plan: TaskPlan, step: PlanStep, ref: string): StepRequirementContract | undefined {
    const direct = step.requirements?.find((item) => item.ref === ref);
    if (direct) return direct;
    for (const candidate of plan.steps) {
      const contract = candidate.requirements?.find((item) => item.ref === ref);
      if (contract) return contract;
    }
    if (!this.isWorkflowDataRef(ref)) return undefined;
    return {
      ref,
      description: `Resolve missing workflow requirement ${ref}`,
      sourceHints: step.sourceHints ? [...step.sourceHints] : undefined,
    };
  }

  private missingRequirementRef(step: PlanStep, result?: StepResult): string | undefined {
    const explicit = result?.missing.find((item) => this.isWorkflowDataRef(item));
    if (explicit) return explicit;
    return step.outputs.find((output) => this.isWorkflowDataRef(output) && !result?.facts.some((fact) => fact.key === output));
  }

  private isWorkflowDataRef(value: string): boolean {
    try {
      parseWorkflowDataRef(value);
      return true;
    } catch {
      return false;
    }
  }

  private consumeRequirementRecheck(state: PlanExecutionState, step: PlanStep): string[] {
    const rechecks = state.requirementRechecks;
    if (!rechecks || rechecks.size === 0) return [];
    const satisfied: string[] = [];
    for (const output of step.outputs) {
      const key = `${step.id}|${output}`;
      if (!rechecks.has(key)) continue;
      if (!state.executionContext.has(output)) continue;
      rechecks.delete(key);
      satisfied.push(output);
    }
    return satisfied;
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
      retrieval: current.retrieval ?? previous.retrieval,
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

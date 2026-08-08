// AgentRuntime.ts
import type { HumanInteraction } from '@agent/Human/HumanInteraction';
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

export class AgentRuntime {
  private static readonly MAX_UNDERSTAND_TOOL_BATCHES = 2;
  private static readonly MAX_UNDERSTAND_TOOLS_PER_BATCH = 3;

  public constructor(
    private readonly configuration: AgentConfiguration,
    private readonly operationRegistry: OperationRegistry,
    private readonly modelController: ModelController,
    private readonly toolExecutor: ToolExecutor,
    private readonly changeExecutor: ChangeExecutor,
    private readonly human: HumanInteraction,
    private readonly logger: Logger,
    private readonly reporter: ExecutionReporter,
  ) {}

  public async execute(task: Task, conversation: Conversation): Promise<Execution> {
    const execution = new Execution(task.id);
    execution.status = 'running';
    execution.currentOperation = task.options?.initialOperation ?? 'plan';
    execution.addEvent('task', { description: task.description });

    const context = this.logContext(task, execution);
    const startedAt = Date.now();
    let understandToolBatches = 0;
    let taskIntent: TaskIntent = this.inferTaskIntent(task.description);

    await this.logger.info('execution-started', { operation: execution.currentOperation }, context);
    this.reporter.task(task.description);

    for (let step = 1; step <= this.configuration.maxSteps; step += 1) {
      execution.currentStep = step;
      const operation = await this.resolveOperation(execution.currentOperation ?? 'plan', task, execution);
      if (!operation) {
        execution.status = 'failed';
        execution.result = `No available operation for ${execution.currentOperation ?? 'unknown'}`;
        break;
      }

      execution.currentOperation = operation.id;
      execution.addEvent('operation-started', { step, operation: operation.id });
      await this.logger.info('operation-selected', { step, operation: operation.id }, context);
      this.reporter.step(step, operation.id);

      if (operation.id === 'verify') {
        await this.logger.info('verification-started', { step }, context);
      }

      let result: OperationResult;
      try {
        result = await this.modelController.execute({ task, execution, conversation, operation });
      } catch (error) {
        execution.addEvent('model-error', { operation: operation.id, error: String(error) });
        await this.logger.error('model-error', { operation: operation.id, error: String(error) }, context);
        if (operation.id !== 'resolve-failure' && this.operationRegistry.has('resolve-failure')) {
          await this.transition(execution, 'resolve-failure', 'model-error', context);
          continue;
        }
        execution.status = 'failed';
        execution.result = String(error);
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
        taskIntent = result.intent;
        await this.logger.info('task-intent-classified', { intent: taskIntent, source: 'model' }, context);
      }

      if (operation.id === 'plan' && result.toolCalls.length > 0) {
        await this.logger.warn('plan-tool-calls-ignored', { count: result.toolCalls.length }, context);
        await this.transition(execution, 'understand', 'plan-cannot-use-tools', context);
        continue;
      }

      if (operation.id === 'finalize' && result.toolCalls.length > 0) {
        await this.logger.warn('finalize-invalid-result', { reason: 'tool-calls', count: result.toolCalls.length }, context);
        execution.status = 'failed';
        execution.result = 'Finalize returned tool calls instead of a completed final answer';
        break;
      }

      if (result.toolCalls.length > 0) {
        const maxCalls = operation.id === 'understand'
          ? AgentRuntime.MAX_UNDERSTAND_TOOLS_PER_BATCH
          : undefined;

        await this.toolExecutor.execute(result.toolCalls, execution, context, maxCalls);
        this.reporter.tools(Math.min(result.toolCalls.length, maxCalls ?? result.toolCalls.length));

        if (operation.id === 'understand') {
          understandToolBatches += 1;
          if (understandToolBatches >= AgentRuntime.MAX_UNDERSTAND_TOOL_BATCHES) {
            const target = this.afterUnderstandTarget(taskIntent);
            await this.logger.info('understand-budget-exhausted', {
              toolBatches: understandToolBatches,
              limit: AgentRuntime.MAX_UNDERSTAND_TOOL_BATCHES,
              intent: taskIntent,
              target,
            }, context);
            if (this.operationRegistry.has(target)) {
              await this.transition(execution, target, 'understand-tool-budget', context);
              continue;
            }
          }
        }

        // The tool response is intentionally returned to the same intellectual operation once.
        // Any nextOperation mixed into a tool-call response is ignored because it violates the protocol.
        execution.currentOperation = operation.id;
        continue;
      }

      if (result.changes.length > 0) {
        await this.changeExecutor.apply(result.changes, execution, context);
        this.reporter.changes(result.changes.map((change) => change.path));
        if (operation.id === 'implement') {
          const target = this.operationRegistry.has('review') ? 'review' : 'finalize';
          await this.transition(execution, target, 'changes-applied', context);
          continue;
        }
      }

      if (result.question) {
        execution.status = 'waiting';
        execution.addEvent('human-question', { question: result.question });
        await this.logger.info('human-question', { question: result.question }, context);
        const answer = await this.human.ask(result.question);
        execution.addEvent('human-answer', { answer });
        execution.status = 'running';
        await this.logger.info('human-answer', undefined, context);
        execution.currentOperation = operation.id;
        continue;
      }

      if (operation.id === 'verify') {
        await this.logger.info('verification-result', { status: result.status, message: result.message }, context);
      }

      if (result.status === 'failed') {
        if (operation.id !== 'resolve-failure' && this.operationRegistry.has('resolve-failure')) {
          await this.transition(execution, 'resolve-failure', 'operation-failed', context);
          continue;
        }
        execution.status = 'failed';
        execution.result = result.message ?? 'Operation failed';
        break;
      }

      if (result.status === 'completed') {
        const finalAnswer = result.finalAnswer?.trim();
        const hasAppliedChanges = execution.history.some((event) => event.type === 'change-applied');
        if (operation.id === 'finalize' && !finalAnswer) {
          await this.logger.warn('finalize-invalid-result', { reason: 'missing-final-answer' }, context);
          execution.status = 'failed';
          execution.result = 'Finalize completed without finalAnswer';
          break;
        }
        if (taskIntent === 'write' && !hasAppliedChanges && result.changes.length === 0) {
          await this.logger.warn('write-task-completed-without-changes', undefined, context);
          if (this.operationRegistry.has('implement') && operation.id !== 'implement') {
            await this.transition(execution, 'implement', 'write-task-needs-changes', context);
            continue;
          }
          execution.status = 'failed';
          execution.result = 'Write task completed without applying changes';
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
          await this.logger.warn('operation-transition-rejected', {
            from: operation.id,
            requested: requestedNextOperation,
            allowed,
          }, context);
          const fallback = operation.id === 'understand'
            ? this.afterUnderstandTarget(taskIntent)
            : operation.fallback;
          if (fallback && this.operationRegistry.has(fallback)) {
            await this.transition(execution, fallback, 'invalid-model-transition', context);
            continue;
          }
          execution.currentOperation = operation.id;
          continue;
        }

        // Prevent analysis from bouncing back into planning after evidence collection started.
        const target = operation.id === 'understand' && requestedNextOperation === 'plan'
          ? 'finalize'
          : requestedNextOperation;
        await this.transition(execution, target, target === requestedNextOperation ? 'model-requested' : 'understand-no-replan', context);
        continue;
      }

      if (operation.id === 'plan' && result.status === 'continue' && this.operationRegistry.has('understand')) {
        await this.transition(execution, 'understand', 'plan-no-action', context);
        continue;
      }

      if (operation.id === 'understand' && result.status === 'continue') {
        const target = this.afterUnderstandTarget(taskIntent);
        await this.logger.warn('operation-no-progress', {
          operation: operation.id,
          intent: taskIntent,
          target,
        }, context);
        if (this.operationRegistry.has(target)) {
          await this.transition(execution, target, 'understand-no-progress', context);
          continue;
        }
      }

      if (operation.id === 'finalize' && result.status === 'continue') {
        await this.logger.warn('finalize-invalid-result', { reason: 'status-continue' }, context);
        execution.status = 'failed';
        execution.result = 'Finalize did not return status=completed with finalAnswer';
        break;
      }

      execution.currentOperation = operation.id;
    }

    if (execution.status === 'running') {
      execution.status = 'failed';
      execution.result = `Execution exceeded maxSteps=${this.configuration.maxSteps}`;
      await this.logger.warn('execution-max-steps', { maxSteps: this.configuration.maxSteps }, context);
    }

    const metrics = this.executionMetrics(execution, startedAt);
    execution.addEvent('execution-metrics', metrics);
    await this.logger.info('execution-metrics', metrics, context);
    execution.addEvent('execution-finished', { status: execution.status, result: execution.result });
    await this.logger.info('execution-finished', { status: execution.status, result: execution.result }, context);
    const changedFiles = new Set(execution.history
      .filter((event) => event.type === 'change-applied')
      .map((event) => (event.data as { path?: string } | undefined)?.path)
      .filter((path): path is string => Boolean(path))).size;
    if (execution.status === 'completed') {
      this.reporter.completed(execution.result ?? 'Completed', metrics.durationMs, changedFiles);
    } else {
      this.reporter.failed(execution.result ?? execution.status, metrics.durationMs);
    }
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

    return {
      durationMs: Date.now() - startedAt,
      modelCalls,
      toolCalls,
      promptTokens,
      completionTokens,
      operations,
    };
  }

  private formatFinalResult(result: OperationResult): string {
    const finalAnswer = result.finalAnswer?.trim();
    if (finalAnswer) return finalAnswer;

    const parts: string[] = [];
    if (result.message?.trim()) parts.push(result.message.trim());
    if (result.observations.length > 0) {
      parts.push(result.observations.map((item) => `- ${item}`).join('\n'));
    }
    return parts.join('\n\n') || 'Completed';
  }

  private async transition(
    execution: Execution,
    to: string,
    reason: string,
    context: ReturnType<AgentRuntime['logContext']>,
  ): Promise<void> {
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

    const fallback = id !== 'understand' ? this.operationRegistry.get('understand') : undefined;
    if (fallback) {
      execution.addEvent('operation-fallback', { requested: id, fallback: fallback.id });
      return fallback;
    }
    return undefined;
  }

  private afterUnderstandTarget(intent: TaskIntent): 'implement' | 'finalize' {
    return intent === 'write' ? 'implement' : 'finalize';
  }

  private inferTaskIntent(description: string): TaskIntent {
    const normalized = description.toLowerCase();
    const writeSignals = [
      'добав', 'измени', 'измен', 'исправ', 'удали', 'создай', 'рефактор', 'реализ',
      'add ', 'change ', 'modify ', 'fix ', 'delete ', 'remove ', 'create ', 'implement ', 'refactor ',
    ];
    return writeSignals.some((signal) => normalized.includes(signal)) ? 'write' : 'read';
  }

  private logContext(task: Task, execution: Execution) {
    return {
      projectId: task.projectId,
      conversationId: task.conversationId,
      taskId: task.id,
      executionId: execution.id,
    };
  }
}

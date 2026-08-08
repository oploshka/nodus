// AgentRuntime.ts
import type { HumanInteraction } from '@agent/Human/HumanInteraction';
import type { ChangeExecutor } from '@agent/Execution/ChangeExecutor';
import type { ToolExecutor } from '@agent/Execution/ToolExecutor';
import type { AgentConfiguration } from '@core/Configuration/Configuration';
import type { Conversation } from '@core/Conversation/Conversation';
import { Execution } from '@core/Execution/Execution';
import type { Logger } from '@core/Logging/Logger';
import type { Task } from '@core/Task/Task';
import type { ModelController } from '@model/Controller/ModelController';
import type { OperationResult } from '@model/Result/OperationResult';
import type { OperationProfile } from '@operation/Profile/OperationProfile';
import type { OperationRegistry } from '@operation/Registry/OperationRegistry';

export class AgentRuntime {
  public constructor(
    private readonly configuration: AgentConfiguration,
    private readonly operationRegistry: OperationRegistry,
    private readonly modelController: ModelController,
    private readonly toolExecutor: ToolExecutor,
    private readonly changeExecutor: ChangeExecutor,
    private readonly human: HumanInteraction,
    private readonly logger: Logger,
  ) {}

  public async execute(task: Task, conversation: Conversation): Promise<Execution> {
    const execution = new Execution(task.id);
    execution.status = 'running';
    execution.currentOperation = task.options?.initialOperation ?? 'plan';
    execution.addEvent('task', { description: task.description });

    const context = this.logContext(task, execution);
    await this.logger.info('execution-started', { operation: execution.currentOperation }, context);

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

      if (operation.id === 'verify') {
        await this.logger.info('verification-started', { step }, context);
      }

      let result: OperationResult;
      try {
        result = await this.modelController.execute({
          task,
          execution,
          conversation,
          operation,
        });
      } catch (error) {
        execution.addEvent('model-error', { operation: operation.id, error: String(error) });
        await this.logger.error('model-error', { operation: operation.id, error: String(error) }, context);
        if (operation.id !== 'resolve-failure' && this.operationRegistry.has('resolve-failure')) {
          execution.currentOperation = 'resolve-failure';
          continue;
        }
        execution.status = 'failed';
        execution.result = String(error);
        break;
      }

      execution.addEvent('operation-result', {
        operation: operation.id,
        status: result.status,
        message: result.message,
        observations: result.observations,
      });

      if (result.toolCalls.length > 0) {
        await this.toolExecutor.execute(result.toolCalls, execution, context);
        execution.currentOperation = operation.id;
        continue;
      }

      if (result.changes.length > 0) {
        await this.changeExecutor.apply(result.changes, execution, context);
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

      if (result.nextOperation) {
        execution.currentOperation = result.nextOperation;
        continue;
      }

      if (result.status === 'failed') {
        if (operation.id !== 'resolve-failure' && this.operationRegistry.has('resolve-failure')) {
          execution.currentOperation = 'resolve-failure';
          continue;
        }
        execution.status = 'failed';
        execution.result = result.message ?? 'Operation failed';
        break;
      }

      if (result.status === 'completed') {
        execution.status = 'completed';
        execution.result = result.message ?? 'Completed';
        break;
      }

      execution.currentOperation = operation.id;
    }

    if (execution.status === 'running') {
      execution.status = 'failed';
      execution.result = `Execution exceeded maxSteps=${this.configuration.maxSteps}`;
      await this.logger.warn('execution-max-steps', { maxSteps: this.configuration.maxSteps }, context);
    }

    execution.addEvent('execution-finished', { status: execution.status, result: execution.result });
    await this.logger.info('execution-finished', { status: execution.status, result: execution.result }, context);
    return execution;
  }

  private async resolveOperation(id: string, task: Task, execution: Execution): Promise<OperationProfile | undefined> {
    const profile = this.operationRegistry.get(id);
    if (profile) {
      return profile;
    }

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

  private logContext(task: Task, execution: Execution) {
    return {
      projectId: task.projectId,
      conversationId: task.conversationId,
      taskId: task.id,
      executionId: execution.id,
    };
  }
}

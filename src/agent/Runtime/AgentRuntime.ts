// AgentRuntime.ts
import type { AgentConfiguration } from '@core/Configuration/Configuration';
import type { Conversation } from '@core/Conversation/Conversation';
import { Execution } from '@core/Execution/Execution';
import type { Logger } from '@core/Logging/Logger';
import type { Task } from '@core/Task/Task';
import type { HumanInteraction } from '@agent/Human/HumanInteraction';
import type { ModelController } from '@model/Controller/ModelController';
import type { OperationResult } from '@model/Result/OperationResult';
import type { OperationProfile } from '@operation/Profile/OperationProfile';
import type { OperationRegistry } from '@operation/Registry/OperationRegistry';
import type { ProjectSession } from '@project/ProjectSession/ProjectSession';
import type { ToolRegistry } from '@tool/Registry/ToolRegistry';
import type { ToolResult } from '@tool/Tool/Tool';

export class AgentRuntime {
  public constructor(
    private readonly configuration: AgentConfiguration,
    private readonly projectSession: ProjectSession,
    private readonly operationRegistry: OperationRegistry,
    private readonly modelController: ModelController,
    private readonly toolRegistry: ToolRegistry,
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
          projectSession: this.projectSession,
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
        await this.executeTools(result, task, execution);
        execution.currentOperation = operation.id;
        continue;
      }

      if (result.changes.length > 0) {
        await this.applyChanges(result, task, execution);
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

  private async executeTools(result: OperationResult, task: Task, execution: Execution): Promise<void> {
    const context = this.logContext(task, execution);
    for (const call of result.toolCalls) {
      const tool = this.toolRegistry.get(call.tool);
      if (!tool) {
        execution.addEvent('tool-result', { tool: call.tool, ok: false, error: 'Tool not found' });
        await this.logger.warn('tool-missing', { tool: call.tool }, context);
        continue;
      }

      await this.logger.info('tool-called', { tool: call.tool, input: call.input }, context);
      const toolResult = await tool.execute(call.input, {
        projectRoot: this.projectSession.root,
        exclude: this.projectSession.configuration.exclude ?? [],
      });
      execution.addEvent('tool-result', { tool: call.tool, input: call.input, result: toolResult });
      await this.logger.info('tool-result', { tool: call.tool, ok: toolResult.ok }, context);
    }
  }

  private async applyChanges(result: OperationResult, task: Task, execution: Execution): Promise<void> {
    const tool = this.toolRegistry.get('file-system');
    const context = this.logContext(task, execution);
    if (!tool) {
      throw new Error('file-system tool is required to apply changes');
    }

    for (const change of result.changes) {
      let toolResult: ToolResult;
      if (change.type === 'write') {
        toolResult = await tool.execute({ action: 'write', path: change.path, content: change.content }, {
          projectRoot: this.projectSession.root,
          exclude: this.projectSession.configuration.exclude ?? [],
        });
      } else {
        toolResult = await tool.execute({ action: 'delete', path: change.path }, {
          projectRoot: this.projectSession.root,
          exclude: this.projectSession.configuration.exclude ?? [],
        });
      }

      execution.addEvent('change-applied', { change: { type: change.type, path: change.path }, result: toolResult });
      await this.logger.info('change-applied', { type: change.type, path: change.path, ok: toolResult.ok }, context);
      if (!toolResult.ok) {
        throw new Error(`Failed to apply change ${change.path}: ${toolResult.error ?? 'unknown error'}`);
      }
    }
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

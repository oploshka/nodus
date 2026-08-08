// ModelController.ts
import type { LoggingConfiguration, ModelConfiguration } from '@core/Configuration/Configuration';
import type { Conversation } from '@core/Conversation/Conversation';
import type { Execution } from '@core/Execution/Execution';
import type { Logger } from '@core/Logging/Logger';
import type { Task } from '@core/Task/Task';
import type { ContextSelector } from '@context/Selector/ContextSelector';
import type { ModelAdapter } from '@model/Adapter/ModelAdapter';
import type { PromptRegistry } from '@model/Profile/PromptRegistry';
import type { ModelRequest } from '@model/Request/ModelRequest';
import type { OperationResult } from '@model/Result/OperationResult';
import type { OperationProfile } from '@operation/Profile/OperationProfile';
import type { OperationRegistry } from '@operation/Registry/OperationRegistry';
import type { ProjectSession } from '@project/ProjectSession/ProjectSession';
import type { ToolRegistry } from '@tool/Registry/ToolRegistry';

export interface ModelExecutionInput {
  task: Task;
  execution: Execution;
  conversation: Conversation;
  projectSession: ProjectSession;
  operation: OperationProfile;
}

export class ModelController {
  public constructor(
    private readonly configuration: ModelConfiguration,
    private readonly logging: LoggingConfiguration,
    private readonly adapter: ModelAdapter,
    private readonly promptRegistry: PromptRegistry,
    private readonly contextSelector: ContextSelector,
    private readonly operationRegistry: OperationRegistry,
    private readonly toolRegistry: ToolRegistry,
    private readonly logger: Logger,
  ) {}

  public async execute(input: ModelExecutionInput): Promise<OperationResult> {
    const prompt = this.promptRegistry.get(input.operation.promptId);
    const context = this.contextSelector.select(
      input.task,
      input.execution,
      input.conversation,
      input.projectSession,
      input.operation,
    );

    const request: ModelRequest = {
      model: this.configuration.model,
      temperature: this.configuration.temperature,
      maxTokens: this.configuration.maxTokens,
      messages: [
        {
          role: 'system',
          content: `${prompt.systemPrompt}\n\nOperation purpose: ${prompt.purpose}\n\nInstructions:\n${prompt.instructions.map((value) => `- ${value}`).join('\n')}\n\n${this.responseProtocol()}`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: {
              id: input.task.id,
              description: input.task.description,
              context: input.task.context,
            },
            operation: {
              id: input.operation.id,
              description: input.operation.description,
              contextStrategy: input.operation.contextStrategy,
            },
            policies: context.policies,
            knowledge: context.knowledge,
            conversation: context.conversation,
            executionHistory: context.executionHistory,
            project: context.project,
            availableOperations: this.operationRegistry.list().map(({ id, description }) => ({ id, description })),
            availableTools: this.toolRegistry.definitions(),
          }, null, 2),
        },
      ],
    };

    const logContext = {
      projectId: input.task.projectId,
      conversationId: input.task.conversationId,
      taskId: input.task.id,
      executionId: input.execution.id,
    };

    await this.logger.info('model-called', { operation: input.operation.id, model: this.configuration.model }, logContext);
    if (this.logging.modelPayload) {
      await this.logger.debug('model-request-payload', request, logContext);
    }

    const response = await this.adapter.complete(request);
    if (this.logging.modelPayload) {
      await this.logger.debug('model-response-payload', response, logContext);
    }

    const result = this.parseOperationResult(response.content);
    await this.logger.info('model-responded', {
      operation: input.operation.id,
      status: result.status,
      nextOperation: result.nextOperation,
      toolCalls: result.toolCalls.length,
      changes: result.changes.length,
      hasQuestion: Boolean(result.question),
    }, logContext);

    return result;
  }

  private parseOperationResult(content: string): OperationResult {
    const raw = this.extractJson(content);
    const parsed = JSON.parse(raw) as Partial<OperationResult>;
    const statuses = new Set(['continue', 'waiting', 'completed', 'failed']);

    if (!parsed.status || !statuses.has(parsed.status)) {
      throw new Error(`Invalid model status: ${String(parsed.status)}`);
    }

    return {
      status: parsed.status,
      message: typeof parsed.message === 'string' ? parsed.message : undefined,
      nextOperation: typeof parsed.nextOperation === 'string' ? parsed.nextOperation : undefined,
      toolCalls: Array.isArray(parsed.toolCalls) ? parsed.toolCalls : [],
      changes: Array.isArray(parsed.changes) ? parsed.changes : [],
      question: typeof parsed.question === 'string' ? parsed.question : undefined,
      observations: Array.isArray(parsed.observations) ? parsed.observations.map(String) : [],
      data: parsed.data,
    };
  }

  private extractJson(content: string): string {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed;
    }

    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return fenced[1].trim();
    }

    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return trimmed.slice(start, end + 1);
    }

    throw new Error('Model response does not contain a JSON object');
  }

  private responseProtocol(): string {
    return `Response protocol:
Return ONLY valid JSON with this shape:
{
  "status": "continue | waiting | completed | failed",
  "message": "short user-facing or execution note",
  "nextOperation": "optional operation id",
  "toolCalls": [{ "tool": "tool id", "input": {} }],
  "changes": [{ "type": "write", "path": "relative/path", "content": "..." }, { "type": "delete", "path": "relative/path" }],
  "question": "question for human when status=waiting",
  "observations": ["short factual observation"],
  "data": {}
}
When toolCalls is non-empty, use status=continue and leave changes, question, and nextOperation empty so Nodus can return the tool results to you. When asking a human question, use status=waiting and leave nextOperation empty so the answer can return to the same operation. Use changes for project file edits. If another intellectual step is needed, set nextOperation. If the whole Task is done, use status=completed without nextOperation.`;
  }
}

// ModelController.ts

import type { AgentConfiguration, LoggingConfiguration, ModelConfiguration } from '@core/Configuration/Configuration';
import type { Conversation } from '@core/Conversation/Conversation';
import type { Execution } from '@core/Execution/Execution';
import type { Logger } from '@core/Logging/Logger';
import type { PayloadLogger } from '@core/Logging/PayloadLogger';
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
  operation: OperationProfile;
}

export class ModelController {
  public constructor(
    private readonly configuration: ModelConfiguration,
    private readonly agentConfiguration: AgentConfiguration,
    private readonly logging: LoggingConfiguration,
    private readonly adapter: ModelAdapter,
    private readonly promptRegistry: PromptRegistry,
    private readonly contextSelector: ContextSelector,
    private readonly projectSession: ProjectSession,
    private readonly operationRegistry: OperationRegistry,
    private readonly toolRegistry: ToolRegistry,
    private readonly logger: Logger,
    private readonly payloadLogger: PayloadLogger,
  ) {}

  public async execute(input: ModelExecutionInput): Promise<OperationResult> {
    const prompt = this.promptRegistry.get(input.operation.promptId);
    const context = this.contextSelector.select(
      input.task,
      input.execution,
      input.conversation,
      this.projectSession,
      input.operation,
    );

    const responseLanguage = this.resolveResponseLanguage(input.task.description);
    const contextTelemetry = this.contextTelemetry(context);

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
            language: {
              response: responseLanguage,
              internal: this.agentConfiguration.internalLanguage,
              instruction: `Write all user-facing text in ${responseLanguage}. Do not switch language because of source files or model defaults.`,
            },
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
            toolContext: context.toolContext,
            project: context.project,
            availableOperations: this.operationRegistry.list().map(({ id, description }) => ({ id, description })),
            availableTools: this.availableToolsFor(input.operation.id),
            responseProtocolReminder: 'Respond with one OperationResult JSON object only. The top-level object MUST contain status. Do not return an execution event, tool-result event, transcript entry, or copied context object.',
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
    const payloadContext = {
      executionId: input.execution.id,
      step: input.execution.currentStep,
      operation: input.operation.id,
    };

    let requestPayloadPath: string | undefined;
    if (this.logging.modelPayload) {
      requestPayloadPath = await this.payloadLogger.writeRequest(payloadContext, request);
    }

    await this.logger.debug('context-built', {
      step: input.execution.currentStep,
      operation: input.operation.id,
      ...contextTelemetry,
    }, logContext);

    await this.logger.info('model-called', {
      step: input.execution.currentStep,
      operation: input.operation.id,
      model: this.configuration.model,
      payload: requestPayloadPath,
    }, logContext);

    const response = await this.adapter.complete(request);

    let responsePayloadPath: string | undefined;
    if (this.logging.modelPayload) {
      responsePayloadPath = await this.payloadLogger.writeResponse(payloadContext, response);
    }

    const result = await this.parseOrRepairOperationResult(response.content, request, input, logContext);
    input.execution.addEvent('model-usage', { operation: input.operation.id, usage: response.usage });
    input.execution.consumeToolContext();
    await this.logger.info('model-responded', {
      step: input.execution.currentStep,
      operation: input.operation.id,
      status: result.status,
      nextOperation: result.nextOperation,
      toolCalls: result.toolCalls.length,
      changes: result.changes.length,
      hasQuestion: Boolean(result.question),
      hasFinalAnswer: Boolean(result.finalAnswer),
      message: result.message,
      usage: response.usage,
      payload: responsePayloadPath,
    }, logContext);

    return result;
  }

  private resolveResponseLanguage(description: string): string {
    if (this.agentConfiguration.responseLanguage !== 'auto') {
      return this.agentConfiguration.responseLanguage;
    }

    const cyrillic = (description.match(/[А-Яа-яЁё]/g) ?? []).length;
    const latin = (description.match(/[A-Za-z]/g) ?? []).length;
    return cyrillic > latin ? 'ru' : 'en';
  }

  private contextTelemetry(context: ReturnType<ContextSelector['select']>) {
    const size = (value: unknown): number => {
      try { return JSON.stringify(value).length; } catch { return 0; }
    };
    const chars = {
      conversation: size(context.conversation),
      history: size(context.executionHistory),
      toolContext: size(context.toolContext),
      policies: size(context.policies),
      knowledge: size(context.knowledge),
      project: size(context.project),
    };
    const totalChars = Object.values(chars).reduce((sum, value) => sum + value, 0);
    return { ...chars, totalChars, estimatedTokens: Math.ceil(totalChars / 4) };
  }

  private availableToolsFor(operationId: string) {
    if (operationId === 'plan' || operationId === 'finalize') {
      return [];
    }
    return this.toolRegistry.definitions();
  }

  private async parseOrRepairOperationResult(
    content: string,
    originalRequest: ModelRequest,
    input: ModelExecutionInput,
    logContext: {
      projectId: string;
      conversationId: string;
      taskId: string;
      executionId: string;
    },
  ): Promise<OperationResult> {
    try {
      return this.parseOperationResult(content);
    } catch (error) {
      await this.logger.warn('model-protocol-invalid', {
        step: input.execution.currentStep,
        operation: input.operation.id,
        error: String(error),
      }, logContext);

      const repairRequest: ModelRequest = {
        model: originalRequest.model,
        temperature: 0,
        maxTokens: Math.min(originalRequest.maxTokens ?? 1024, 512),
        messages: [
          {
            role: 'system',
            content: `You are a strict JSON protocol repairer. Convert the supplied malformed model output into exactly one valid OperationResult JSON object. Do not continue the task, do not add facts, and do not return an execution-history event. ${this.responseProtocol()}`,
          },
          {
            role: 'user',
            content: JSON.stringify({
              operation: input.operation.id,
              malformedOutput: content,
              requirement: 'Return one top-level OperationResult object with a valid status field.',
            }, null, 2),
          },
        ],
      };

      const repaired = await this.adapter.complete(repairRequest);
      if (this.logging.modelPayload) {
        await this.payloadLogger.writeResponse({
          executionId: input.execution.id,
          step: input.execution.currentStep,
          operation: `${input.operation.id}-protocol-repair`,
        }, repaired);
      }

      const result = this.parseOperationResult(repaired.content);
      await this.logger.info('model-protocol-repaired', {
        step: input.execution.currentStep,
        operation: input.operation.id,
        usage: repaired.usage,
      }, logContext);
      return result;
    }
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
      finalAnswer: typeof parsed.finalAnswer === 'string' ? parsed.finalAnswer : undefined,
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
  "message": "short execution note",
  "finalAnswer": "full user-facing answer; use only when status=completed",
  "nextOperation": "optional operation id",
  "toolCalls": [{ "tool": "tool id", "input": {} }],
  "changes": [{ "type": "write", "path": "relative/path", "content": "..." }, { "type": "delete", "path": "relative/path" }],
  "question": "question for human when status=waiting",
  "observations": ["short factual observation"],
  "data": {}
}
When toolCalls is non-empty, use status=continue and leave changes, question, finalAnswer, and nextOperation empty so Nodus can return the tool results to you. When asking a human question, use status=waiting and leave nextOperation empty so the answer can return to the same operation. Use changes for project file edits. If another intellectual step is needed, set nextOperation. If the whole Task is done, use status=completed without nextOperation and put the complete answer for the human in finalAnswer. Keep message short.`;
  }
}

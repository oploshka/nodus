// ModelController.ts

import type { AgentConfiguration, LoggingConfiguration, ModelConfiguration } from '@core/Configuration/Configuration';
import type { Conversation } from '@core/Conversation/Conversation';
import type { ExecutionReporter } from '@agent/Reporting/ExecutionReporter';
import type { Execution } from '@core/Execution/Execution';
import type { Logger } from '@core/Logging/Logger';
import type { PayloadLogger } from '@core/Logging/PayloadLogger';
import type { Task } from '@core/Task/Task';
import type { ContextSelector } from '@context/Selector/ContextSelector';
import type { ModelAdapter } from '@model/Adapter/ModelAdapter';
import type { ModelRequest } from '@model/Request/ModelRequest';
import type { OperationResult, StepResult } from '@model/Result/OperationResult';
import type { OperationProfile } from '@operation/Profile/OperationProfile';
import type { OperationRegistry } from '@operation/Registry/OperationRegistry';
import type { ProjectSession } from '@project/ProjectSession/ProjectSession';
import type { ToolRegistry } from '@tool/Registry/ToolRegistry';
import { composePrompt } from '@model/Prompt/PromptComposer';
import { OPERATION_RESULT_RETURN_FORMAT } from '@model/Protocol/OperationResultProtocol';
import { EditFileRawProtocol } from '@model/Protocol/EditFileRawProtocol';

export interface ModelExecutionInput {
  task: Task;
  execution: Execution;
  conversation: Conversation;
  operation: OperationProfile;
  activeStep?: { id: string; type: string; action?: string; subject?: string; goal: string; attempt: number; maxAttempts: number; inputs: string[]; outputs: string[]; targetPath?: string };
  stepContext?: { facts: Array<{ key: string; value: string; evidence: unknown[]; producerStepId: string }>; missingInputs: string[]; activeEvidence?: { findings: string[]; evidence: unknown[]; missing: string[] } };
}

export class ModelController {
  private readonly editFileProtocol = new EditFileRawProtocol();

  public constructor(
    private readonly configuration: ModelConfiguration,
    private readonly agentConfiguration: AgentConfiguration,
    private readonly logging: LoggingConfiguration,
    private readonly adapter: ModelAdapter,
    private readonly contextSelector: ContextSelector,
    private readonly projectSession: ProjectSession,
    private readonly operationRegistry: OperationRegistry,
    private readonly toolRegistry: ToolRegistry,
    private readonly logger: Logger,
    private readonly payloadLogger: PayloadLogger,
    private readonly reporter: ExecutionReporter,
  ) {}

  public async execute(input: ModelExecutionInput): Promise<OperationResult> {
    const prompt = input.operation.prompt;
    const context = this.contextSelector.select(
      input.task,
      input.execution,
      input.conversation,
      this.projectSession,
      input.operation,
    );

    const responseLanguage = this.resolveResponseLanguage(input.task.description);
    const contextTelemetry = this.contextTelemetry(context);

    const responseProtocol = input.operation.id === 'edit-file'
      ? this.editFileProtocol.instructions(input.activeStep?.targetPath)
      : prompt.returnFormat ?? OPERATION_RESULT_RETURN_FORMAT;
    const request: ModelRequest = {
      model: this.configuration.model,
      temperature: input.operation.model.temperature ?? this.configuration.temperature,
      maxTokens: input.operation.model.maxTokens ?? this.configuration.maxTokens,
      messages: [
        {
          role: 'system',
          content: composePrompt(prompt, { returnFormat: responseProtocol }),
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
              contextStrategy: input.operation.execution.contextStrategy,
            },
            activeStep: input.activeStep,
            stepContext: input.stepContext ?? { facts: [], missingInputs: [], activeEvidence: { findings: [], evidence: [], missing: [] } },
            stepIsolationRule: input.activeStep
              ? `Work ONLY on activeStep.action for activeStep.subject. The action/subject contract is authoritative; the human-readable goal is descriptive only.`
              : undefined,
            policies: context.policies,
            knowledge: context.knowledge,
            conversation: input.activeStep ? [] : context.conversation,
            executionHistory: input.activeStep ? [] : context.executionHistory,
            toolContext: context.toolContext,
            project: context.project,
            availableOperations: input.activeStep ? [] : this.operationRegistry.list().map(({ id, description }) => ({ id, description })),
            availableTools: this.availableToolsFor(input.operation.id),
            responseProtocolReminder: input.operation.id === 'edit-file'
              ? 'Use the edit-file raw protocol from the system message. Edit exactly activeStep.targetPath. Do not return JSON for a completed file write.'
              : input.activeStep
                ? 'Respond with one OperationResult JSON object only. Work only on activeStep. Leave nextOperation empty because PlanExecutor owns routing.'
                : 'Respond with one OperationResult JSON object only. The top-level object MUST contain status. Do not return an execution event, tool-result event, transcript entry, or copied context object.',
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

    this.reporter.modelRequest(input.operation.id);
    const modelStartedAt = Date.now();
    const response = await this.adapter.complete(request);
    const modelDurationMs = Date.now() - modelStartedAt;

    let responsePayloadPath: string | undefined;
    if (this.logging.modelPayload) {
      responsePayloadPath = await this.payloadLogger.writeResponse(payloadContext, response);
    }

    const result = input.operation.id === 'edit-file'
      ? this.editFileProtocol.parse(response.content, input.activeStep?.targetPath)
      : await this.parseOrRepairOperationResult(
          response.content,
          request,
          input,
          logContext,
          response.usage?.completion_tokens,
        );
    input.execution.addEvent('model-usage', { operation: input.operation.id, usage: response.usage });
    input.execution.consumeToolContext();
    this.reporter.modelResponse(
      input.operation.id,
      modelDurationMs,
      response.usage?.prompt_tokens,
      response.usage?.completion_tokens,
    );
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
    return { ...chars, totalChars, estimatedTokens: Math.ceil(totalChars / 2), estimateSafetyFactor: 2 };
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
    completionTokens?: number,
  ): Promise<OperationResult> {
    try {
      return this.parseOperationResult(content);
    } catch (error) {
      await this.logger.warn('model-protocol-invalid', {
        step: input.execution.currentStep,
        operation: input.operation.id,
        error: String(error),
      }, logContext);

      const configuredLimit = originalRequest.maxTokens ?? 1024;
      const likelyTruncated = completionTokens !== undefined && completionTokens >= configuredLimit;
      this.reporter.protocolRetry(input.operation.id, likelyTruncated);

      const repairRequest: ModelRequest = {
        model: originalRequest.model,
        temperature: 0,
        maxTokens: Math.max(Math.min(originalRequest.maxTokens ?? 1024, 768), 768),
        messages: [
          {
            role: 'system',
            content: `You are a strict JSON protocol repairer. Return the SHORTEST valid OperationResult JSON that preserves the supplied result. Do not continue the task and do not add facts. Omit optional prose. Keep findings/facts compact. ${OPERATION_RESULT_RETURN_FORMAT}`,
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

      const repairStartedAt = Date.now();
      const repaired = await this.adapter.complete(repairRequest);
      const repairDurationMs = Date.now() - repairStartedAt;
      if (this.logging.modelPayload) {
        await this.payloadLogger.writeResponse({
          executionId: input.execution.id,
          step: input.execution.currentStep,
          operation: `${input.operation.id}-protocol-repair`,
        }, repaired);
      }

      const result = this.parseOperationResult(repaired.content);
      this.reporter.protocolRepaired(input.operation.id, repairDurationMs);
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
      intent: parsed.intent === 'read' || parsed.intent === 'write' ? parsed.intent : undefined,
      toolCalls: Array.isArray(parsed.toolCalls) ? parsed.toolCalls : [],
      changes: Array.isArray(parsed.changes) ? parsed.changes : [],
      question: typeof parsed.question === 'string' ? parsed.question : undefined,
      observations: Array.isArray(parsed.observations) ? parsed.observations.map(String) : [],
      stepResult: this.parseStepResult((parsed as { stepResult?: unknown }).stepResult),
      data: parsed.data,
    };
  }

  private parseStepResult(value: unknown): StepResult | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const raw = value as Record<string, unknown>;
    const evidence = Array.isArray(raw.evidence)
      ? raw.evidence.flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const entry = item as Record<string, unknown>;
          if (typeof entry.fact !== 'string' || !entry.fact.trim()) return [];
          return [{
            path: typeof entry.path === 'string' ? entry.path : undefined,
            symbol: typeof entry.symbol === 'string' ? entry.symbol : undefined,
            fact: entry.fact.trim(),
          }];
        })
      : [];
    const facts = Array.isArray(raw.facts)
      ? raw.facts.flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const entry = item as Record<string, unknown>;
          if (typeof entry.key !== 'string' || !entry.key.trim() || typeof entry.value !== 'string' || !entry.value.trim()) return [];
          const factEvidence = Array.isArray(entry.evidence)
            ? entry.evidence.flatMap((evidenceItem) => {
                if (!evidenceItem || typeof evidenceItem !== 'object') return [];
                const evidenceEntry = evidenceItem as Record<string, unknown>;
                if (typeof evidenceEntry.fact !== 'string' || !evidenceEntry.fact.trim()) return [];
                return [{
                  path: typeof evidenceEntry.path === 'string' ? evidenceEntry.path : undefined,
                  symbol: typeof evidenceEntry.symbol === 'string' ? evidenceEntry.symbol : undefined,
                  fact: evidenceEntry.fact.trim(),
                }];
              })
            : [];
          return [{ key: entry.key.trim(), value: entry.value.trim(), evidence: factEvidence.slice(0, 8) }];
        })
      : [];
    const targets = Array.isArray(raw.targets)
      ? raw.targets.map(String).map((item) => item.trim()).filter((item) => item && !item.startsWith('/') && !item.includes('..')).slice(0, 16)
      : undefined;
    return {
      goalSatisfied: raw.goalSatisfied === true,
      targets,
      findings: Array.isArray(raw.findings) ? raw.findings.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8) : [],
      evidence: evidence.slice(0, 12),
      missing: Array.isArray(raw.missing) ? raw.missing.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8) : [],
      facts: facts.slice(0, 12),
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

}

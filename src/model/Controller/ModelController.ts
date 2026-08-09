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
import { transportMessages } from '@model/Request/ModelMessageTransport';
import type { OperationResult, StepEvidenceItem, StepResult } from '@model/Result/OperationResult';
import type { OperationProfile } from '@operation/Profile/OperationProfile';
import type { OperationRegistry } from '@operation/Registry/OperationRegistry';
import type { ProjectSession } from '@project/ProjectSession/ProjectSession';
import type { ToolRegistry } from '@tool/Registry/ToolRegistry';
import { composePrompt } from '@model/Prompt/PromptComposer';
import {
  activeEvidenceMessage,
  activeStepMessage,
  factsMessage,
  knowledgeMessage,
  projectMessage,
  taskMessage,
  toolDefinitionsMessage,
  toolResultMessages,
  userMessage,
} from '@model/Prompt/ModelInputComposer';
import { OPERATION_RESULT_RETURN_FORMAT } from '@model/Protocol/OperationResultProtocol';
import { EditFileRawProtocol } from '@model/Protocol/EditFileRawProtocol';

export interface ModelExecutionInput {
  task: Task;
  execution: Execution;
  conversation: Conversation;
  operation: OperationProfile;
  activeStep?: { id: string; type: string; action?: string; subject?: string; goal: string; attempt: number; maxAttempts: number; inputs: string[]; outputs: string[]; targetPath?: string };
  stepContext?: { facts: Array<{ key: string; value: string; evidence: StepEvidenceItem[]; producerStepId: string }>; missingInputs: string[]; activeEvidence?: { findings: string[]; evidence: StepEvidenceItem[]; missing: string[] } };
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
      messages: this.composeRequestMessages(input, context, responseLanguage, responseProtocol),
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

  private composeRequestMessages(
    input: ModelExecutionInput,
    context: ReturnType<ContextSelector['select']>,
    responseLanguage: string,
    responseProtocol: string,
  ): ModelRequest['messages'] {
    const messages: ModelRequest['messages'] = [
      {
        role: 'system',
        content: composePrompt(input.operation.prompt, { returnFormat: responseProtocol }),
      },
      taskMessage(input.task.description, input.task.context),
    ];

    if (input.activeStep) {
      messages.push(activeStepMessage(input.activeStep, responseLanguage));
      const factBlock = factsMessage(input.stepContext?.facts ?? []);
      if (factBlock) messages.push(factBlock);
      const evidenceBlock = activeEvidenceMessage(input.stepContext?.activeEvidence);
      if (evidenceBlock) messages.push(evidenceBlock);
    } else {
      messages.push(userMessage('Operation:', `${input.operation.id} — ${input.operation.description}
Response language: ${responseLanguage}`));
    }

    const projectBlock = projectMessage(context.project);
    if (projectBlock) messages.push(projectBlock);
    const policyBlock = knowledgeMessage('Policies', context.policies);
    if (policyBlock) messages.push(policyBlock);
    const knowledgeBlock = knowledgeMessage('Project knowledge', context.knowledge);
    if (knowledgeBlock) messages.push(knowledgeBlock);

    if (!input.activeStep) {
      if (context.conversation.length > 0) {
        messages.push(userMessage('Recent conversation:', context.conversation.map((entry) => `- ${entry.description}${entry.result ? ` → ${entry.result}` : ''}`).join('\n')));
      }
      if (context.executionHistory.length > 0) {
        messages.push(userMessage('Recent execution state:', context.executionHistory.slice(-8).map((event) => `- ${event.type}`).join('\n')));
      }
      const operations = this.operationRegistry.list().map(({ id, description }) => `- ${id}: ${description}`);
      if (operations.length > 0) messages.push(userMessage('Available operations:', operations.join('\n')));
    }

    const tools = this.availableToolsFor(input.operation.id);
    const toolsBlock = toolDefinitionsMessage(tools);
    if (toolsBlock) messages.push(toolsBlock);

    // Full source text is never copied from reusable facts. It appears only as transient
    // source context: after an explicit understand read, or as the runtime-preloaded target
    // for edit-file.
    messages.push(...toolResultMessages(
      context.toolContext,
      input.operation.id === 'edit-file' ? input.activeStep?.targetPath : undefined,
    ));
    messages.push(userMessage(
      'Instruction:',
      input.operation.id === 'edit-file' && input.activeStep
        ? `Edit the supplied authoritative target source ${input.activeStep.targetPath ?? ''} now. Do not request tools. Return the completed edit-file RAW protocol response.`
        : input.activeStep
          ? `Perform only ${input.activeStep.type}/${input.activeStep.action ?? 'step'} for ${input.activeStep.subject ?? input.activeStep.goal}. Use the output protocol from the system message.`
          : 'Perform the requested operation now using the supplied context and the output protocol from the system message.',
    ));
    return transportMessages(messages, this.configuration.messageLayout);
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
    if (operationId === 'plan' || operationId === 'finalize' || operationId === 'prepare-change' || operationId === 'edit-file') {
      return [];
    }
    const definitions = this.toolRegistry.definitions();
    if (operationId === 'search') {
      return definitions.filter((tool) => tool.id === 'search' || tool.id === 'file-system');
    }
    if (operationId === 'understand') {
      // Search locates candidates. Understand may read already-known files, but it must
      // not reopen broad project discovery under a semantic step.
      return definitions.filter((tool) => tool.id === 'file-system');
    }
    return definitions;
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

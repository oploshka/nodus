// RecoveryController.ts
import type { ModelConfiguration } from '@core/Configuration/Configuration';
import type { Execution, ToolContextEntry } from '@core/Execution/Execution';
import type { Logger } from '@core/Logging/Logger';
import type { Task } from '@core/Task/Task';
import type { ModelAdapter } from '@model/Adapter/ModelAdapter';
import type { ModelCallProfile } from '@model/Profile/ModelCallProfile';
import { composePrompt } from '@model/Prompt/PromptComposer';
import type { ModelRequest } from '@model/Request/ModelRequest';
import type { StepEvidenceItem, StepResult } from '@model/Result/OperationResult';
import type { ExecutionFact } from '@agent/Planning/ExecutionContext';
import type { PlanStep, PlanStepType, TaskPlan } from '@agent/Planning/TaskPlan';
import type { StepRegistry } from '@agent/Planning/StepRegistry';

const STEP_EVIDENCE_PROFILE: ModelCallProfile = {
  prompt: {
    purpose: 'Decide whether accumulated concrete evidence closes the active search/understand step.',
    rules: [
      'Never broaden or reinterpret the active goal.',
      'For a generic request to find an API/source/access method, a directly usable property, field, method, or receiver chain is sufficient unless the goal explicitly requires a dedicated getter/service/CLI/HTTP API.',
      'Never require a different abstraction merely because one could exist. Absence of a dedicated getter is not missing evidence when a direct access path already satisfies the goal.',
      'Use only supplied indexed paths and evidence. Never invent directories or modules.',
      'If sufficient, emit every requested output key. If insufficient, return the smallest missing detail that is strictly necessary for the original goal.',
    ],
  },
  model: { temperature: 0, maxTokens: 512 },
};

const STEP_SATISFACTION_PROFILE: ModelCallProfile = {
  prompt: {
    purpose: 'Decide whether reusable facts already satisfy a plan-step postcondition.',
    rules: [
      'Treat outputs as postconditions and ask only whether they are derivable from supplied facts/evidence.',
      'Never strengthen the original goal or demand a new API shape.',
      'Preserve source-scoped access paths and receiver chains exactly unless evidence supports a replacement.',
      'If all outputs can be conservatively derived, mark the step satisfied; otherwise state only the smallest original-goal blocker.',
    ],
  },
  model: { temperature: 0, maxTokens: 256 },
};

const RECOVER_PLAN_PROFILE: ModelCallProfile = {
  prompt: {
    purpose: 'Recover a stalled or exhausted plan step without restarting the whole task.',
    rules: [
      'Diagnose only the current blocker using the supplied plan and recent execution evidence.',
      'Prefer the smallest correction that can unblock the existing plan.',
      'Use currentStepResult.missing as the authoritative blocker list. Insert steps only to resolve those concrete missing items.',
      'You may retry the current step, insert up to three focused steps before it, skip it only when it is genuinely unnecessary, request human help, or fail clearly.',
      'Use only the supplied available step types for inserted steps.',
      'Do not edit files or solve the whole task inside recovery.',
      'When a human hint is supplied, treat it as additional evidence and use it to guide the correction.',
      'Do not silently discard completed plan steps.',
      'Do not invent a concrete file path or directory unless it already exists in supplied project files or evidence.',
      'Do not insert a step whose goal duplicates an already completed step or a previous recovery insertion. If no new evidence can be named, request human help instead of expanding the plan.',
      'Do not broaden an access-path question into a search for getters, services, CLI APIs, or HTTP APIs unless the original step explicitly requires those forms.',
      'When the runtime reports step-no-progress, do not choose retry-current unless a human hint supplied genuinely new information.',
    ],
  },
  model: { temperature: 0, maxTokens: 768 },
};

export type RecoveryAction = 'retry-current' | 'insert-steps' | 'skip-current' | 'request-human' | 'fail';

export interface RecoveryDecision {
  action: RecoveryAction;
  reason: string;
  steps: PlanStep[];
}

export interface StepSatisfactionDecision {
  satisfied: boolean;
  reason: string;
  missing: string[];
  facts: Array<{ key: string; value: string }>;
}

export interface StepEvidenceDecision extends StepSatisfactionDecision {
  findings: string[];
  evidence: StepEvidenceItem[];
}

export class RecoveryController {
  public constructor(
    private readonly configuration: ModelConfiguration,
    private readonly adapter: ModelAdapter,
    private readonly stepRegistry: StepRegistry,
    private readonly logger: Logger,
  ) {}

  public async assessToolEvidence(input: {
    task: Task;
    execution: Execution;
    step: PlanStep;
    toolContext: ToolContextEntry[];
    accumulated?: StepResult;
    knownFacts: ExecutionFact[];
  }): Promise<StepEvidenceDecision> {
    if (input.toolContext.length === 0) {
      return {
        satisfied: false,
        reason: 'No tool evidence is available.',
        missing: input.accumulated?.missing ?? input.step.outputs,
        facts: [],
        findings: input.accumulated?.findings ?? [],
        evidence: input.accumulated?.evidence ?? [],
      };
    }

    const compactToolContext = input.toolContext.map((entry) => ({
      call: entry.call,
      result: {
        ok: entry.result.ok,
        error: entry.result.error,
        data: this.truncateEvidenceData(entry.result.data, 12000),
      },
    }));

    const request: ModelRequest = {
      model: this.configuration.model,
      temperature: STEP_EVIDENCE_PROFILE.model.temperature ?? this.configuration.temperature,
      maxTokens: Math.min(this.configuration.maxTokens ?? 512, STEP_EVIDENCE_PROFILE.model.maxTokens ?? 512),
      messages: [
        {
          role: 'system',
          content: composePrompt(STEP_EVIDENCE_PROFILE.prompt, {
            rules: [
              `The active operation type is ${input.step.type}.`,
              input.step.type === 'search'
                ? 'SEARCH is evidence-driven: require concrete located project evidence for the requested outputs.'
                : 'UNDERSTAND is derivational: combine supplied known facts/evidence; do not demand another read merely to reconfirm them.',
              'Use accumulated findings/evidence, reusable known facts, and the latest tool results together.',
              input.step.type === 'search'
                ? 'Evidence paths/symbols must be directly supported by supplied tool results or accumulated evidence.'
                : 'For derived understanding, evidence may be inherited from supplied known facts and accumulated evidence.',
            ],
            returnFormat: 'Return ONLY JSON: {"satisfied":true|false,"reason":"short reason","missing":["..."],"findings":["..."],"evidence":[{"path":"optional","symbol":"optional","fact":"supported fact"}],"facts":[{"key":"exact output key","value":"compact reusable value"}]}',
          }),
        },
        {
          role: 'user',
          content: JSON.stringify({
            goal: input.step.goal,
            outputs: input.step.outputs,
            accumulated: input.accumulated ? {
              findings: input.accumulated.findings,
              evidence: input.accumulated.evidence,
              missing: input.accumulated.missing,
            } : undefined,
            knownFacts: input.knownFacts.map((fact) => ({
              key: fact.key,
              value: fact.value,
              evidence: fact.evidence,
            })),
            latestToolResults: compactToolContext,
          }),
        },
      ],
    };

    try {
      const response = await this.adapter.complete(request);
      const parsed = JSON.parse(this.extractJson(response.content)) as {
        satisfied?: unknown;
        reason?: unknown;
        missing?: unknown;
        findings?: unknown;
        evidence?: Array<{ path?: unknown; symbol?: unknown; fact?: unknown }>;
        facts?: Array<{ key?: unknown; value?: unknown }>;
      };
      const requested = new Set(input.step.outputs);
      const facts = (parsed.facts ?? [])
        .filter((fact) => typeof fact.key === 'string' && requested.has(fact.key) && typeof fact.value === 'string' && fact.value.trim())
        .map((fact) => ({ key: fact.key as string, value: (fact.value as string).trim() }));
      const evidence = (parsed.evidence ?? [])
        .filter((item) => typeof item.fact === 'string' && item.fact.trim())
        .map((item) => ({
          path: typeof item.path === 'string' && item.path.trim() ? item.path.trim() : undefined,
          symbol: typeof item.symbol === 'string' && item.symbol.trim() ? item.symbol.trim() : undefined,
          fact: (item.fact as string).trim(),
        }))
        .slice(0, 20);
      const satisfied = parsed.satisfied === true
        && input.step.outputs.length > 0
        && input.step.outputs.every((key) => facts.some((fact) => fact.key === key));
      const decision: StepEvidenceDecision = {
        satisfied,
        reason: typeof parsed.reason === 'string' && parsed.reason.trim()
          ? parsed.reason.trim()
          : satisfied ? 'Tool evidence satisfies the step.' : 'More evidence is required.',
        missing: Array.isArray(parsed.missing) ? parsed.missing.map(String).map((value) => value.trim()).filter(Boolean).slice(0, 6) : [],
        findings: Array.isArray(parsed.findings) ? parsed.findings.map(String).map((value) => value.trim()).filter(Boolean).slice(0, 8) : [],
        evidence,
        facts: satisfied ? facts : [],
      };
      await this.logger.info('step-evidence-assessed', {
        stepId: input.step.id,
        satisfied: decision.satisfied,
        reason: decision.reason,
        missing: decision.missing,
        toolResults: input.toolContext.length,
        outputs: input.step.outputs,
      }, {
        projectId: input.task.projectId,
        conversationId: input.task.conversationId,
        taskId: input.task.id,
        executionId: input.execution.id,
      });
      return decision;
    } catch (error) {
      await this.logger.warn('step-evidence-assessment-failed', { stepId: input.step.id, error: String(error) }, {
        projectId: input.task.projectId,
        conversationId: input.task.conversationId,
        taskId: input.task.id,
        executionId: input.execution.id,
      });
      return {
        satisfied: false,
        reason: 'Evidence evaluation failed; continue with the normal step loop.',
        missing: input.accumulated?.missing ?? [],
        facts: [],
        findings: input.accumulated?.findings ?? [],
        evidence: input.accumulated?.evidence ?? [],
      };
    }
  }

  public async assessStepSatisfaction(input: {
    task: Task;
    execution: Execution;
    step: PlanStep;
    facts: ExecutionFact[];
    accumulated?: StepResult;
  }): Promise<StepSatisfactionDecision> {
    if (input.facts.length === 0 || input.step.outputs.length === 0) {
      return { satisfied: false, reason: 'No reusable facts are available.', missing: input.step.outputs, facts: [] };
    }

    const request: ModelRequest = {
      model: this.configuration.model,
      temperature: STEP_SATISFACTION_PROFILE.model.temperature ?? this.configuration.temperature,
      maxTokens: Math.min(this.configuration.maxTokens ?? 256, STEP_SATISFACTION_PROFILE.model.maxTokens ?? 256),
      messages: [
        {
          role: 'system',
          content: composePrompt(STEP_SATISFACTION_PROFILE.prompt, {
            rules: [
              `The active operation type is ${input.step.type}.`,
              input.step.type === 'understand'
                ? 'UNDERSTAND is derivational: combine declared input facts conservatively and do not require a new read merely to reconnect supplied facts.'
                : 'SEARCH is evidence-driven: only claim satisfaction when supplied facts contain located evidence required by the original goal.',
              'When the goal names a concrete function or file, preserve that scope. A property access valid in another class is not automatically valid there.',
            ],
            returnFormat: 'Return ONLY JSON: {"satisfied":true|false,"reason":"short reason","missing":["..."],"facts":[{"key":"exact output key","value":"compact derived value"}]}',
          }),
        },
        {
          role: 'user',
          content: JSON.stringify({
            goal: input.step.goal,
            outputs: input.step.outputs,
            knownFacts: input.facts.map((fact) => ({
              key: fact.key,
              value: fact.value,
              evidence: fact.evidence,
              producerStepId: fact.producerStepId,
            })),
            accumulatedUnderstanding: input.accumulated ? {
              findings: input.accumulated.findings,
              evidence: input.accumulated.evidence,
              missing: input.accumulated.missing,
            } : undefined,
          }),
        },
      ],
    };

    try {
      const response = await this.adapter.complete(request);
      const parsed = JSON.parse(this.extractJson(response.content)) as {
        satisfied?: unknown;
        reason?: unknown;
        missing?: unknown;
        facts?: Array<{ key?: unknown; value?: unknown }>;
      };
      const requested = new Set(input.step.outputs);
      const candidates = (parsed.facts ?? [])
        .filter((fact) => typeof fact.key === 'string' && requested.has(fact.key) && typeof fact.value === 'string' && fact.value.trim())
        .map((fact) => ({ key: fact.key as string, value: (fact.value as string).trim() }));
      const grounding = this.conservativelyGroundDerivedFacts(input.step, candidates, input.facts);
      const facts = grounding.facts;
      const satisfied = parsed.satisfied === true && input.step.outputs.every((key) => facts.some((fact) => fact.key === key));
      const parsedMissing = Array.isArray(parsed.missing) ? parsed.missing.map(String).filter(Boolean).slice(0, 6) : [];
      const groundingMissing = grounding.rejected.length > 0
        ? [`ungrounded derived references: ${grounding.rejected.slice(0, 4).join(', ')}`]
        : [];
      const decision: StepSatisfactionDecision = {
        satisfied,
        reason: grounding.rejected.length > 0
          ? `Rejected derived code references that are not grounded in the relevant source evidence: ${grounding.rejected.slice(0, 4).join(', ')}`
          : typeof parsed.reason === 'string' ? parsed.reason : satisfied ? 'Known facts satisfy the step.' : 'More evidence is required.',
        missing: satisfied ? [] : [...parsedMissing, ...groundingMissing].slice(0, 6),
        facts: satisfied ? facts : [],
      };
      await this.logger.info('step-satisfaction-assessed', {
        stepId: input.step.id,
        satisfied: decision.satisfied,
        reason: decision.reason,
        outputs: input.step.outputs,
        facts: input.facts.map((fact) => fact.key),
      }, {
        projectId: input.task.projectId,
        conversationId: input.task.conversationId,
        taskId: input.task.id,
        executionId: input.execution.id,
      });
      return decision;
    } catch (error) {
      await this.logger.warn('step-satisfaction-assessment-failed', { stepId: input.step.id, error: String(error) }, {
        projectId: input.task.projectId,
        conversationId: input.task.conversationId,
        taskId: input.task.id,
        executionId: input.execution.id,
      });
      return { satisfied: false, reason: 'Semantic satisfaction check failed; execute the step normally.', missing: [], facts: [] };
    }
  }

  private conservativelyGroundDerivedFacts(
    step: PlanStep,
    facts: Array<{ key: string; value: string }>,
    sourceFacts: ExecutionFact[],
  ): { facts: Array<{ key: string; value: string }>; rejected: string[] } {
    if (step.type !== 'understand') return { facts, rejected: [] };

    const allEvidence = sourceFacts.flatMap((fact) => fact.evidence);
    if (allEvidence.length === 0) {
      const references = facts.flatMap((fact) => this.codeReferences(fact.value));
      return references.length > 0 ? { facts: [], rejected: Array.from(new Set(references)) } : { facts, rejected: [] };
    }

    const scopedEvidence = this.scopeEvidence(step.goal, allEvidence);
    const allCorpus = this.evidenceCorpus(allEvidence);
    const scopedCorpus = this.evidenceCorpus(scopedEvidence.length > 0 ? scopedEvidence : allEvidence);
    const accepted: Array<{ key: string; value: string }> = [];
    const rejected: string[] = [];

    for (const fact of facts) {
      const references = this.codeReferences(fact.value);
      const invalid = references.filter((reference) => !this.isGroundedReference(reference, scopedCorpus, allCorpus));
      if (invalid.length > 0) {
        rejected.push(...invalid);
        continue;
      }
      accepted.push(fact);
    }

    return { facts: accepted, rejected: Array.from(new Set(rejected)) };
  }

  private scopeEvidence(goal: string, evidence: StepEvidenceItem[]): StepEvidenceItem[] {
    const functionMatch = goal.match(/(?:function|функц[а-яё]*)\s+`([^`]+)`/iu);
    const fileMatch = goal.match(/(?:file|файл[а-яё]*)\s+`([^`]+)`/iu);
    const scopeHint = functionMatch?.[1]?.trim() || fileMatch?.[1]?.trim();
    if (!scopeHint) return [];
    const normalizedHint = this.normalizeReference(scopeHint).toLowerCase();
    return evidence.filter((item) => {
      const path = this.normalizeReference(item.path ?? '').toLowerCase();
      const symbol = this.normalizeReference(item.symbol ?? '').toLowerCase();
      const fact = this.normalizeReference(item.fact).toLowerCase();
      return path.includes(normalizedHint) || symbol.includes(normalizedHint) || fact.includes(normalizedHint);
    });
  }

  private evidenceCorpus(evidence: StepEvidenceItem[]): string {
    return this.normalizeReference(evidence
      .map((item) => `${item.path ?? ''}\n${item.symbol ?? ''}\n${item.fact}`)
      .join('\n'))
      .toLowerCase();
  }

  private codeReferences(value: string): string[] {
    const normalized = value.replace(/\?\./g, '.');
    const matches = normalized.match(/\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*){1,5}\b/g) ?? [];
    return Array.from(new Set(matches.filter((match) => !match.includes('src.') && !match.endsWith('.ts'))));
  }

  private isGroundedReference(reference: string, scopedCorpus: string, allCorpus: string): boolean {
    const normalized = this.normalizeReference(reference).toLowerCase();
    if (scopedCorpus.includes(normalized)) return true;

    const parts = normalized.split('.').filter(Boolean);
    if (parts.length < 2) return true;
    const receiver = `${parts[0]}.${parts[1]}`;

    // The receiver must exist in the semantic scope of the goal (for example runCli),
    // while trailing properties may be composed from other directly evidenced facts.
    if (!scopedCorpus.includes(receiver)) return false;
    return parts.slice(2).every((part) => allCorpus.includes(part));
  }

  private normalizeReference(value: string): string {
    return value.replace(/\?\./g, '.').replace(/\s+/g, ' ').trim();
  }

  public async recover(input: {
    task: Task;
    execution: Execution;
    plan: TaskPlan;
    stepIndex: number;
    reason: string;
    humanHint?: string;
    currentStepResult?: StepResult;
    completedStepEvidence?: unknown[];
    executionFacts?: unknown[];
    previousRecoveryGoals?: string[];
  }): Promise<RecoveryDecision> {
    const currentStep = input.plan.steps[input.stepIndex];
    const request: ModelRequest = {
      model: this.configuration.model,
      temperature: RECOVER_PLAN_PROFILE.model.temperature ?? this.configuration.temperature,
      maxTokens: Math.min(this.configuration.maxTokens ?? 768, RECOVER_PLAN_PROFILE.model.maxTokens ?? 768),
      messages: [
        {
          role: 'system',
          content: composePrompt(RECOVER_PLAN_PROFILE.prompt, { returnFormat: this.protocol() }),
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: input.task.description,
            currentStep,
            reason: input.reason,
            humanHint: input.humanHint,
            currentStepResult: input.currentStepResult,
            completedStepEvidence: input.completedStepEvidence ?? [],
            executionFacts: input.executionFacts ?? [],
            previousRecoveryGoals: input.previousRecoveryGoals ?? [],
            plan: input.plan.steps.map((step, index) => ({ index, type: step.type, goal: step.goal, status: step.status })),
            recentExecution: input.execution.history.slice(-12),
            availableStepTypes: this.stepRegistry.listForPlanner().map((definition) => ({
              type: definition.type,
              description: definition.description,
              maxAttempts: definition.maxAttempts,
            })),
          }, null, 2),
        },
      ],
    };

    try {
      const response = await this.adapter.complete(request);
      const decision = this.parse(response.content);
      await this.logger.info('plan-recovery-decided', { action: decision.action, reason: decision.reason, steps: decision.steps }, {
        projectId: input.task.projectId,
        conversationId: input.task.conversationId,
        taskId: input.task.id,
        executionId: input.execution.id,
      });
      return decision;
    } catch (error) {
      await this.logger.warn('plan-recovery-failed', { error: String(error) }, {
        projectId: input.task.projectId,
        conversationId: input.task.conversationId,
        taskId: input.task.id,
        executionId: input.execution.id,
      });
      return { action: 'request-human', reason: `Recovery failed: ${String(error)}`, steps: [] };
    }
  }

  private parse(content: string): RecoveryDecision {
    const raw = this.extractJson(content);
    const parsed = JSON.parse(raw) as {
      action?: unknown;
      reason?: unknown;
      steps?: Array<{ id?: unknown; type?: unknown; goal?: unknown; maxAttempts?: unknown; inputs?: unknown; outputs?: unknown }>;
    };
    const actions = new Set<RecoveryAction>(['retry-current', 'insert-steps', 'skip-current', 'request-human', 'fail']);
    if (typeof parsed.action !== 'string' || !actions.has(parsed.action as RecoveryAction)) {
      throw new Error(`Unsupported recovery action: ${String(parsed.action)}`);
    }

    const steps: PlanStep[] = [];
    for (const [index, step] of (parsed.steps ?? []).slice(0, 3).entries()) {
      if (typeof step.type !== 'string' || !this.stepRegistry.has(step.type)) {
        throw new Error(`Unsupported recovery step type: ${String(step.type)}`);
      }
      const type = step.type as PlanStepType;
      const max = this.stepRegistry.limit(type);
      const requested = typeof step.maxAttempts === 'number' ? Math.floor(step.maxAttempts) : max;
      const id = typeof step.id === 'string' && step.id.trim() ? step.id : `recovery-${index + 1}`;
      steps.push({
        id,
        type,
        goal: typeof step.goal === 'string' && step.goal.trim() ? step.goal.trim() : this.stepRegistry.get(type).description,
        status: 'pending',
        maxAttempts: Math.max(1, Math.min(requested, max)),
        inputs: this.factKeys(step.inputs),
        outputs: this.factKeys(step.outputs).length > 0 ? this.factKeys(step.outputs) : [`${id}.result`],
        recoveryForStepId: undefined,
      });
    }

    return {
      action: parsed.action as RecoveryAction,
      reason: typeof parsed.reason === 'string' ? parsed.reason : 'Recovery decision',
      steps,
    };
  }

  private factKeys(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map(String).map((item) => item.trim()).filter((item) => /^[a-z0-9][a-z0-9._-]{1,79}$/i.test(item)).slice(0, 8);
  }

  private truncateEvidenceData(value: unknown, maxChars: number): unknown {
    if (typeof value === 'string') {
      return value.length <= maxChars ? value : `${value.slice(0, maxChars)}\n...[truncated]`;
    }
    try {
      const serialized = JSON.stringify(value);
      if (serialized.length <= maxChars) return value;
      return `${serialized.slice(0, maxChars)}...[truncated]`;
    } catch {
      return String(value).slice(0, maxChars);
    }
  }

  private extractJson(content: string): string {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return fenced[1].trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
    throw new Error('Recovery response does not contain JSON');
  }

  private protocol(): string {
    return `Return ONLY JSON:\n{\n  "action": "retry-current | insert-steps | skip-current | request-human | fail",\n  "reason": "short explanation",\n  "steps": [{ "id": "recovery-1", "type": "search | understand | prepare-change | edit-file | review | verify | finalize", "goal": "one concrete goal", "maxAttempts": 1, "inputs": ["existing.fact"], "outputs": ["missing.fact"] }]\n}\nFor insert-steps, outputs must describe the exact missing fact(s) needed by the blocked step. Do not invent concrete file paths.`;
  }
}

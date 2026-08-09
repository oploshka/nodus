// RecoveryController.ts
import type { ModelConfiguration } from '@core/Configuration/Configuration';
import type { Execution } from '@core/Execution/Execution';
import type { Logger } from '@core/Logging/Logger';
import type { Task } from '@core/Task/Task';
import type { ModelAdapter } from '@model/Adapter/ModelAdapter';
import type { PromptRegistry } from '@model/Profile/PromptRegistry';
import type { ModelRequest } from '@model/Request/ModelRequest';
import type { StepResult } from '@model/Result/OperationResult';
import type { ExecutionFact } from '@agent/Planning/ExecutionContext';
import type { PlanStep, PlanStepType, TaskPlan } from '@agent/Planning/TaskPlan';
import type { StepRegistry } from '@agent/Planning/StepRegistry';

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

export class RecoveryController {
  public constructor(
    private readonly configuration: ModelConfiguration,
    private readonly adapter: ModelAdapter,
    private readonly promptRegistry: PromptRegistry,
    private readonly stepRegistry: StepRegistry,
    private readonly logger: Logger,
  ) {}

  public async assessStepSatisfaction(input: {
    task: Task;
    execution: Execution;
    step: PlanStep;
    facts: ExecutionFact[];
  }): Promise<StepSatisfactionDecision> {
    if (input.facts.length === 0 || input.step.outputs.length === 0) {
      return { satisfied: false, reason: 'No reusable facts are available.', missing: input.step.outputs, facts: [] };
    }

    const request: ModelRequest = {
      model: this.configuration.model,
      temperature: 0,
      maxTokens: Math.min(this.configuration.maxTokens ?? 256, 256),
      messages: [
        {
          role: 'system',
          content: [
            'You are a strict data-flow gate inside Nodus.',
            'Decide whether the supplied reusable facts ALREADY fully satisfy the active step goal.',
            'Do not request tools, do not invent evidence, and do not broaden the goal.',
            'Only return satisfied=true when no additional project evidence is required.',
            'If satisfied, emit one compact fact for every requested output key using only supplied facts.',
            'Return ONLY JSON: {"satisfied":true|false,"reason":"short reason","missing":["..."],"facts":[{"key":"exact output key","value":"compact derived value"}]}',
          ].join('\n'),
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
      const facts = (parsed.facts ?? [])
        .filter((fact) => typeof fact.key === 'string' && requested.has(fact.key) && typeof fact.value === 'string' && fact.value.trim())
        .map((fact) => ({ key: fact.key as string, value: (fact.value as string).trim() }));
      const satisfied = parsed.satisfied === true && input.step.outputs.every((key) => facts.some((fact) => fact.key === key));
      const decision: StepSatisfactionDecision = {
        satisfied,
        reason: typeof parsed.reason === 'string' ? parsed.reason : satisfied ? 'Known facts satisfy the step.' : 'More evidence is required.',
        missing: Array.isArray(parsed.missing) ? parsed.missing.map(String).filter(Boolean).slice(0, 6) : [],
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
    const prompt = this.promptRegistry.get('recover-plan');
    const currentStep = input.plan.steps[input.stepIndex];
    const request: ModelRequest = {
      model: this.configuration.model,
      temperature: 0,
      maxTokens: Math.min(this.configuration.maxTokens ?? 1024, 768),
      messages: [
        {
          role: 'system',
          content: `${prompt.systemPrompt}\n\nPurpose: ${prompt.purpose}\n\nInstructions:\n${prompt.instructions.map((value) => `- ${value}`).join('\n')}\n\n${this.protocol()}`,
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

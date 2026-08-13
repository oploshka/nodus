import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { Project } from '@engine/Project/Project.js';
import type { ResearchAnswer } from '@engine/Research/ResearchTypes.js';
import type { PlanStep } from '@engine/Planner/Plan.js';
import type { Task } from '@engine/Task/Task.js';
import type { ActionModelOptions, ActionResult, WorkerAction } from '@engine/Worker/Action/WorkerAction.js';
import { callModel } from '@model/Runner/ModelCaller.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';
import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';
import type { LanguageConfiguration } from '@engine/Type/LanguageConfiguration.js';

interface ChangeDecision {
  outcome: 'ready' | 'missing-information' | 'already-completed' | 'failed';
  summary?: string;
  reason?: string;
  questions?: string[];
  edits?: Array<{ path: string; instruction: string }>;
}

export interface ChangeCodeActionProfile {
  purpose: string;
  guidance: string;
  language: LanguageConfiguration;
}

const decisionSchema: ModelResponseSchema = {
  description: 'One bounded attempt to perform the assigned project change.',
  fields: {
    outcome: {
      type: 'option',
      description: 'Whether the task can be executed now or needs more concrete project knowledge.',
      optionList: [
        { id: 'ready', description: 'Enough information is available; perform the listed edits.' },
        { id: 'missing-information', description: 'Specific project facts are required before editing safely.' },
        { id: 'already-completed', description: 'The requested outcome is already true; no edit is needed.' },
        { id: 'failed', description: 'The task cannot be performed under the supplied constraints.' },
      ],
    },
    summary: { type: 'string', optional: true },
    reason: { type: 'string', optional: true },
    questions: { type: 'array', items: { type: 'string' }, optional: true },
    edits: {
      type: 'array',
      optional: true,
      items: {
        type: 'object',
        fields: {
          path: { type: 'string' },
          instruction: { type: 'string' },
        },
      },
    },
  },
};

export interface ChangeCodeActionInput extends ActionModelOptions {
  task: Task;
  step: PlanStep;
  knowledge: ReadonlyArray<ResearchAnswer>;
}

export interface ChangeCodeActionData {
  summary: string;
}

export interface ResearchActionRequest {
  question: string;
}

export type ChangeCodeEdit = { path: string; instruction: string };
export type ChangeCodeApplyResult =
  | { status: 'completed'; changed: boolean; path: string }
  | { status: 'not-completed'; reason: string };

/**
 * Shared lifecycle for code-changing Actions.
 *
 * A concrete Action owns only the mechanics of applying one prepared file edit
 * (replace, diff, full rewrite, ...). Planning the coherent change and asking
 * for bounded Research stay identical across those strategies.
 */
export abstract class ChangeCodeAction implements WorkerAction<ChangeCodeActionInput, ChangeCodeActionData, ResearchActionRequest> {
  public abstract readonly id: string;
  public abstract readonly description: string;

  protected constructor(
    protected readonly project: Project,
    protected readonly model: ModelRunner,
    protected readonly logger: EngineLogger,
    protected readonly profile: ChangeCodeActionProfile,
    protected readonly defaultModelSettings: ChangeCodeActionInput['settings'] = undefined,
    private readonly maxEditsPerAttempt = 6,
  ) {}

  public async run(context: ChangeCodeActionInput): Promise<ActionResult<ChangeCodeActionData, ResearchActionRequest>> {
    const decision = await callModel<ChangeDecision>(this.model, this.logger, {
      request: {
        message: 'Attempt to complete the assigned PlanStep now.',
        data: {
          task: context.task.description,
          step: context.step,
          purpose: this.profile.purpose,
          candidateFiles: this.candidateFiles(context),
          knowledge: context.knowledge.map((item) => ({
            question: item.question,
            status: item.status,
            answer: item.answer,
            sources: item.sources.map((source) => source.path),
          })),
        },
        format: ModelRequestFormat.Json,
        guidance: [
          this.profile.guidance,
          `Use ${this.profile.language.nodus} for machine-facing fields such as questions and edit instructions. Preserve code identifiers and paths exactly.`,
          `Use ${this.profile.language.response} only for user-facing summary/reason fields.`,
          `When creating human-authored project text (documentation/comments), prefer the project language: ${this.profile.language.project}.`,
          'Start from execution: if the supplied information is sufficient, return the concrete edits immediately.',
          'If safe execution requires project facts that are not supplied, do not guess. Return only the smallest set of specific bounded questions needed for the next execution attempt.',
          'Return at most 3 questions. Prefer one precise question when it can unblock the task.',
          'Do not ask documentation, policy, best-practice, or hypothetical questions unless the user task explicitly requires them.',
          'Do not ask broad questions such as "understand the project". Ask only concrete project facts that block execution now.',
          'Every edit.path must be relative to the project root; never resolve it relative to another source file.',
          'One coherent change may edit multiple files when they are all required for the same outcome.',
          'Keep edits minimal and preserve unrelated behavior.',
          'Do not perform validation; validation is a separate concern.',
        ].join('\n'),
      },
      response: { format: ModelResponseFormat.Json, schema: decisionSchema },
      settings: { maxTokens: 2048, ...this.defaultModelSettings, ...context.settings },
    });

    if (decision.outcome === 'already-completed') {
      return { status: 'completed', data: { summary: decision.summary ?? 'Requested outcome is already present.' } };
    }

    if (decision.outcome === 'failed') {
      return { status: 'failed', reason: decision.reason ?? 'The task cannot be completed under the supplied constraints.', canContinue: false };
    }

    if (decision.outcome === 'missing-information') {
      const questions = (decision.questions ?? []).map((question) => question.trim()).filter(Boolean).slice(0, 3);
      if (questions.length === 0) throw new Error('Attempt reported missing information without concrete questions.');
      return {
        status: 'not-completed',
        reason: decision.reason ?? 'Concrete project knowledge is required before the change can be applied safely.',
        canContinue: true,
        requests: questions.map((question) => ({ actionId: 'research', input: { question } })),
      };
    }

    const edits = (decision.edits ?? []).slice(0, this.maxEditsPerAttempt);
    if (edits.length === 0) throw new Error('Attempt was ready but returned no edits.');

    const changed: string[] = [];
    for (const edit of edits) {
      const result = await this.applyEdit(context, edit);
      if (result.status === 'not-completed') return { ...result, canContinue: true };
      if (result.changed) changed.push(result.path);
    }

    if (changed.length === 0) return { status: 'not-completed', reason: 'Action produced no project changes.', canContinue: true };
    return {
      status: 'completed',
      data: { summary: decision.summary ?? `Changed ${changed.join(', ')}` },
    };
  }

  protected abstract applyEdit(context: ChangeCodeActionInput, edit: ChangeCodeEdit): Promise<ChangeCodeApplyResult>;

  private candidateFiles(context: ChangeCodeActionInput): string[] {
    const paths = new Set<string>();
    for (const source of context.knowledge.flatMap((item) => item.sources)) paths.add(source.path);
    for (const file of this.project.candidateFiles(`${context.task.description}\n${context.step.goal}`, 16)) paths.add(file.path);
    return [...paths].slice(0, 24);
  }
}

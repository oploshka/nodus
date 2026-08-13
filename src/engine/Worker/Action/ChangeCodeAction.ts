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
import { ModelLanguagePolicy } from '@engine/Language/ModelLanguagePolicy.js';
import { ActionPresentation } from '@engine/Presentation/ActionPresentation.js';
import type { EditStrategyId, ProjectEditRequest } from '@engine/Edit/EditTypes.js';

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
  strategy: EditStrategyId;
}

const decisionSchema: ModelResponseSchema = {
  description: 'One bounded attempt to determine the semantic project changes needed for the assigned PlanStep.',
  fields: {
    outcome: { type: 'option', optionList: [
      { id: 'ready', description: 'Enough information is available; return semantic edit intents.' },
      { id: 'missing-information', description: 'Specific project facts are required before editing safely.' },
      { id: 'already-completed', description: 'The requested outcome is already true; no edit is needed.' },
      { id: 'failed', description: 'The task cannot be performed under the supplied constraints.' },
    ] },
    summary: { type: 'string', optional: true },
    reason: { type: 'string', optional: true },
    questions: { type: 'array', items: { type: 'string' }, optional: true },
    edits: { type: 'array', optional: true, items: { type: 'object', fields: { path: { type: 'string' }, instruction: { type: 'string' } } } },
  },
};

export interface ChangeCodeActionInput extends ActionModelOptions {
  task: Task;
  step: PlanStep;
  knowledge: ReadonlyArray<ResearchAnswer>;
}

export interface ChangeCodeActionData { summary: string; edit?: ProjectEditRequest }
export interface ResearchActionRequest { question: string }

/** Worker-side change intent producer. Technical edit serialization belongs to Engine/Edit. */
export class ChangeCodeAction implements WorkerAction<ChangeCodeActionInput, ChangeCodeActionData, ResearchActionRequest> {
  public readonly id = 'change-code';
  public readonly presentation: ActionPresentation;
  public readonly name: string;
  public readonly method: string | undefined;
  public readonly description = 'Determine the smallest coherent set of project edits needed for one PlanStep.';

  public constructor(
    private readonly project: Project,
    private readonly model: ModelRunner,
    private readonly logger: EngineLogger,
    private readonly profile: ChangeCodeActionProfile,
    private readonly defaultModelSettings: ChangeCodeActionInput['settings'] = undefined,
    private readonly maxEditsPerAttempt = 6,
  ) {
    this.presentation = new ActionPresentation({
      name: { en: 'Project change', ru: 'Изменение проекта' },
      detail: strategyLabel(profile.strategy),
    });
    this.name = this.presentation.name();
    this.method = this.presentation.detail();
  }

  public async run(context: ChangeCodeActionInput): Promise<ActionResult<ChangeCodeActionData, ResearchActionRequest>> {
    const decision = await callModel<ChangeDecision>(this.model, this.logger, {
      request: {
        message: 'Determine the concrete project edits required to complete the assigned PlanStep now.',
        data: {
          task: context.task.description,
          step: context.step,
          purpose: this.profile.purpose,
          candidateFiles: this.candidateFiles(context),
          knowledge: context.knowledge.map((item) => ({ question: item.question, status: item.status, answer: item.answer, sources: item.sources.map((source) => source.path) })),
        },
        format: ModelRequestFormat.Json,
        guidance: [
          this.profile.guidance,
          ...new ModelLanguagePolicy(this.profile.language).mixedProjectEdit(),
          'This Action only describes what must change. Do not generate diff, replacement blocks, line ranges, or complete file contents.',
          'Treat summary and reason as internal Nodus fields.',
          'If safe execution requires project facts that are not supplied, return only the smallest bounded questions needed for the next attempt.',
          'Return at most 3 questions.',
          'Every edit.path must be relative to the project root.',
          'Each edit.instruction must describe the required semantic result for exactly that file, without prescribing an edit serialization format.',
          'One coherent change may edit multiple files when required for the same outcome.',
          'Keep edits minimal and preserve unrelated behavior.',
          'Do not perform validation; validation is a separate concern.',
        ].join('\n'),
      },
      response: { format: ModelResponseFormat.Json, schema: decisionSchema },
      settings: { maxTokens: 2048, ...this.defaultModelSettings, ...context.settings },
    });

    if (decision.outcome === 'already-completed') return { status: 'completed', data: { summary: decision.summary ?? 'Requested outcome is already present.' } };
    if (decision.outcome === 'failed') return { status: 'failed', reason: decision.reason ?? 'The task cannot be completed under the supplied constraints.', canContinue: false };
    if (decision.outcome === 'missing-information') {
      const questions = (decision.questions ?? []).map((question) => question.trim()).filter(Boolean).slice(0, 3);
      if (questions.length === 0) throw new Error('Attempt reported missing information without concrete questions.');
      return { status: 'not-completed', reason: decision.reason ?? 'Concrete project knowledge is required before editing safely.', canContinue: true, requests: questions.map((question) => ({ actionId: 'research', input: { question } })) };
    }

    const edits = (decision.edits ?? []).slice(0, this.maxEditsPerAttempt);
    if (edits.length === 0) throw new Error('Attempt was ready but returned no edits.');
    const normalized = [];
    for (const edit of edits) normalized.push({ path: await this.project.resolvePath(edit.path), instruction: edit.instruction.trim() });
    return {
      status: 'completed',
      data: {
        summary: decision.summary ?? `Prepared ${normalized.length} project edit intent(s).`,
        edit: { strategy: this.profile.strategy, edits: normalized, settings: context.settings },
      },
    };
  }

  private candidateFiles(context: ChangeCodeActionInput): string[] {
    const paths = new Set<string>();
    for (const source of context.knowledge.flatMap((item) => item.sources)) paths.add(source.path);
    for (const file of this.project.candidateFiles(`${context.task.description}\n${context.step.goal}`, 16)) paths.add(file.path);
    return [...paths].slice(0, 24);
  }
}

function strategyLabel(strategy: EditStrategyId) {
  if (strategy === 'range-replace') return { en: 'precise replacement', ru: 'точечная замена' };
  if (strategy === 'replace') return { en: 'exact replacement', ru: 'точная замена' };
  if (strategy === 'diff') return { en: 'patch', ru: 'патч' };
  return { en: 'full-file edit', ru: 'полная правка файла' };
}

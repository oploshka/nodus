import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { FileSystem } from '@engine/Common/Tools/FileSystem.js';
import type { iProjectFileIndex } from '@engine/Project/File/ProjectFileIndex.js';
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
import type { tWorkerContextItem } from '@engine/Worker/WorkerContext.js';
import type { sFindFileActionInput } from './FindFileAction.js';

interface ChangeDecision {
  outcome: 'ready' | 'missing-information' | 'already-completed' | 'failed';
  summary?: string;
  reason?: string;
  findFiles?: string[];
  readFiles?: string[];
  questions?: string[];
  edits?: Array<{ path: string; instruction: string }>;
}

export interface ChangeCodeActionProfile {
  purpose: string;
  guidance: string;
  adaptationGuidance?: ReadonlyArray<string>;
  adaptationTemplate?: string;
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
    findFiles: { type: 'array', items: { type: 'string' }, optional: true, description: 'File names or concepts whose project paths are not yet known. FindFile returns paths only.' },
    readFiles: { type: 'array', items: { type: 'string' }, optional: true, description: 'Already known project paths whose contents are required.' },
    questions: { type: 'array', items: { type: 'string' }, optional: true },
    edits: { type: 'array', optional: true, items: { type: 'object', fields: { path: { type: 'string' }, instruction: { type: 'string' } } } },
  },
};

export interface ChangeCodeActionInput extends ActionModelOptions {
  task: Task;
  step: PlanStep;
  context: ReadonlyArray<tWorkerContextItem>;
}

export interface ChangeCodeActionData { summary: string; edit?: ProjectEditRequest }
export interface ResearchActionRequest { question: string }
export interface ReadActionRequest { path: string }
export type tChangeCodeActionRequest = ResearchActionRequest | ReadActionRequest | sFindFileActionInput;

/** Worker-side change intent producer. Technical edit serialization belongs to Engine/Edit. */
export class ChangeCodeAction implements WorkerAction<ChangeCodeActionInput, ChangeCodeActionData, tChangeCodeActionRequest> {
  public readonly id = 'change-code';
  public readonly presentation: ActionPresentation;
  public readonly name: string;
  public readonly method: string | undefined;
  public readonly description = 'Determine the smallest coherent set of project edits needed for one PlanStep.';

  public constructor(
    private readonly fileSystem: FileSystem,
    private readonly fileIndex: iProjectFileIndex,
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

  public async run(context: ChangeCodeActionInput): Promise<ActionResult<ChangeCodeActionData, tChangeCodeActionRequest>> {
    const message = renderMessageTemplate(
      this.profile.adaptationTemplate ?? '##message##',
      'Determine the concrete project edits required to complete the assigned PlanStep now.',
    );
    const decision = await callModel<ChangeDecision>(this.model, this.logger, {
      request: {
        message,
        data: {
          task: context.task.description,
          step: context.step,
          purpose: this.profile.purpose,
          candidateFiles: this.candidateFiles(context),
          context: context.context.map(serializeContext),
        },
        format: ModelRequestFormat.Json,
        guidance: [
          this.profile.guidance,
          ...(this.profile.adaptationGuidance ?? []),
          ...new ModelLanguagePolicy(this.profile.language).mixedProjectEdit(),
          'This Action only describes what must change. Do not generate diff, replacement blocks, line ranges, or complete file contents.',
          'Treat summary and reason as internal Nodus fields.',
          'When information is missing, request the cheapest sufficient operation: findFiles only when a required project path is unknown, readFiles when an already known file must be inspected, and questions only for cross-file analysis or project knowledge that cannot be answered by direct retrieval.',
          'Do not use questions to ask for a file path, exact signature, type fields, or file contents when FindFile/ReadFile can answer it.',
          'readFiles entries must come from candidateFiles, prior FindFile results, or prior context; do not invent paths.',
          'Request only the minimum information needed for the next decision. Do not fill an arbitrary request count.',
          'Every edit.path must be relative to the project root.',
          'Each edit.instruction must describe the required semantic result for exactly that file, without prescribing an edit serialization format.',
          'One coherent change may edit multiple files when required for the same outcome.',
          'Keep edits minimal and preserve unrelated behavior.',
          'Do not perform validation; validation is a separate concern.',
        ].join('\n'),
      },
      response: { format: ModelResponseFormat.Raw, schema: decisionSchema },
      settings: { maxTokens: 2048, ...this.defaultModelSettings, ...context.settings },
    });

    if (decision.outcome === 'already-completed') return { status: 'completed', data: { summary: decision.summary ?? 'Requested outcome is already present.' } };
    if (decision.outcome === 'failed') return { status: 'failed', reason: decision.reason ?? 'The task cannot be completed under the supplied constraints.', canContinue: false };
    if (decision.outcome === 'missing-information') {
      const requests = [
        ...(decision.findFiles ?? []).map((query) => ({ actionId: 'find-file', input: { query: query.trim() } })),
        ...(decision.readFiles ?? []).map((path) => ({ actionId: 'read-file', input: { path: path.trim() } })),
        ...(decision.questions ?? []).map((question) => ({ actionId: 'research', input: { question: question.trim() } })),
      ].filter((request) => Object.values(request.input)[0]).slice(0, 3);
      if (requests.length === 0) throw new Error('Attempt reported missing information without a concrete retrieval or research request.');
      return { status: 'not-completed', reason: decision.reason ?? 'Additional project context is required before editing safely.', canContinue: true, requests };
    }

    const edits = (decision.edits ?? []).slice(0, this.maxEditsPerAttempt);
    if (edits.length === 0) throw new Error('Attempt was ready but returned no edits.');
    const normalized = [];
    for (const edit of edits) normalized.push({ path: await this.fileSystem.resolvePath(edit.path), instruction: edit.instruction.trim() });
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
    for (const item of context.context) {
      if (item.kind === 'search') for (const path of item.paths) paths.add(path);
      else if (item.kind === 'read') paths.add(item.path);
      else if (item.kind === 'research') for (const source of item.value.sources) paths.add(source.path);
    }
    for (const file of this.fileIndex.findFiles(`${context.task.description}\n${context.step.goal}`, 16)) paths.add(file.path);
    return [...paths].slice(0, 24);
  }
}

function serializeContext(item: tWorkerContextItem): unknown {
  if (item.kind === 'search' || item.kind === 'read' || item.kind === 'retrieval-feedback') return item;
  return {
    kind: 'research',
    question: item.value.question,
    status: item.value.status,
    answer: item.value.answer,
    sources: item.value.sources.map((source) => source.path),
  };
}

function renderMessageTemplate(template: string, message: string): string {
  if (!template.includes('##message##')) throw new Error('Change message template must contain ##message## marker.');
  return template.replaceAll('##message##', message);
}

function strategyLabel(strategy: EditStrategyId) {
  if (strategy === 'range-replace') return { en: 'precise replacement', ru: 'точечная замена' };
  if (strategy === 'replace') return { en: 'exact replacement', ru: 'точная замена' };
  if (strategy === 'diff') return { en: 'patch', ru: 'патч' };
  return { en: 'full-file edit', ru: 'полная правка файла' };
}

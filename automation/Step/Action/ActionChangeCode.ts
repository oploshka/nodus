import type { FileSystem } from '@engine/Common/Tools/FileSystem.js';
import { ModelLanguagePolicy } from '@engine/Common/Language/ModelLanguagePolicy.js';
import type { iProjectFileIndex } from '@engine/Project/File/Index/ProjectFileIndex.js';
import type { LanguageConfiguration } from '@engine/Type/LanguageConfiguration.js';
import type { tEngineEmit } from '@engine/EngineEvent.js';
import type { tEngineRunDependencies } from '@engine/EngineStepInterface.js';
import { StepAction } from '@engine/Step/StepAction.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';
import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';
import { callModel } from '@model/Runner/ModelCaller.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';
import { actionCoreResult } from './ActionCoreResult.js';
import type { tActionCoreResult } from './ActionCoreResult.js';

interface ChangeDecision {
  outcome: 'ready' | 'missing-information' | 'already-completed' | 'failed';
  summary?: string;
  reason?: string;
  findFiles?: string[];
  readFiles?: string[];
  questions?: string[];
  edits?: Array<{ path: string; instruction: string }>;
}

interface ChangeCodeRuntime {
  fileSystem: FileSystem;
  fileIndex: iProjectFileIndex;
  model: ModelRunner;
  emit: tEngineEmit;
  language: LanguageConfiguration;
}

export interface sChangeCodeActionData {
  summary: string;
  edit?: {
    strategy: 'range-replace';
    edits: Array<{ path: string; instruction: string }>;
  };
}

export type tChangeCodeActionId = 'find-file' | 'read-file' | 'research';

export type tChangeCodeRequestInput =
  | { query: string }
  | { path: string }
  | { question: string };

interface sChangeCodeActionInput {
  task: unknown;
  context: readonly unknown[];
  actions: readonly tChangeCodeActionId[];
}

const decisionSchema: ModelResponseSchema = {
  description: 'One bounded attempt to determine the semantic project changes needed for the assigned task.',
  fields: {
    outcome: { type: 'option', optionList: [
      { id: 'ready', description: 'Enough information is available; return semantic edit intents.' },
      { id: 'missing-information', description: 'Specific project facts are required before editing safely.' },
      { id: 'already-completed', description: 'The requested outcome is already true; no edit is needed.' },
      { id: 'failed', description: 'The task cannot be performed under the supplied constraints.' },
    ] },
    summary: { type: 'string', optional: true },
    reason: { type: 'string', optional: true },
    findFiles: { type: 'array', items: { type: 'string' }, optional: true },
    readFiles: { type: 'filePathList', optional: true },
    questions: { type: 'array', items: { type: 'string' }, optional: true },
    edits: { type: 'editList', optional: true },
  },
};

/** Stateless Action. Worker supplies task, context and currently available child actions. */
export class ChangeCodeAction extends StepAction {
  public getId(): string {
    return 'change-code';
  }

  public async run(
    input: unknown,
    dependencies: tEngineRunDependencies,
  ): Promise<tActionCoreResult<sChangeCodeActionData, tChangeCodeRequestInput>> {
    const { task, context, actions } = readInput(input);

    try {
      return actionCoreResult(
        await new ChangeCodeExecution(runtimeDependencies(dependencies)).run(task, context, actions),
      );
    } catch (error) {
      return actionCoreResult({
        status: 'not-completed',
        reason: error instanceof Error ? error.message : String(error),
        canContinue: true,
        retry: true,
      });
    }
  }
}

class ChangeCodeExecution {
  public constructor(private readonly runtime: ChangeCodeRuntime) {}

  public async run(
    task: unknown,
    context: readonly unknown[],
    actions: readonly tChangeCodeActionId[],
  ): Promise<tActionCoreResult<sChangeCodeActionData, tChangeCodeRequestInput>> {
    const taskText = describeTask(task);
    const decision = await callModel<ChangeDecision>(this.runtime.model, this.runtime.emit, {
      request: {
        message: 'Determine the concrete project edits required to complete the assigned task now.',
        data: {
          task,
          candidateFiles: this.candidateFiles(taskText, context),
          context,
          availableActions: actions,
        },
        format: ModelRequestFormat.Json,
        guidance: [
          'Implement the requested software/project behavior change.',
          'Prefer existing project APIs and conventions. Change source code only when required by the task.',
          ...new ModelLanguagePolicy(this.runtime.language).mixedProjectEdit(),
          'Describe what must change. Do not generate patch serialization.',
          'When information is missing, request the cheapest sufficient operation.',
          'Only request operations listed in availableActions.',
          'If required information cannot be obtained with availableActions, return failed instead of requesting an unavailable operation.',
          'Use findFiles only when a path is unknown and readFiles when an already known file must be inspected.',
          'Use questions only for project-level conclusions that direct retrieval cannot answer.',
          'Keep edits minimal and preserve unrelated behavior.',
        ].join('\n'),
      },
      response: { format: ModelResponseFormat.Raw, schema: decisionSchema },
      settings: { maxTokens: 2048 },
    });

    if (decision.outcome === 'already-completed') {
      return { status: 'completed', data: { summary: decision.summary ?? 'Requested outcome is already present.' } };
    }
    if (decision.outcome === 'failed') {
      return { status: 'failed', reason: decision.reason ?? 'The task cannot be completed.', canContinue: false };
    }
    if (decision.outcome === 'missing-information') {
      const requests: Array<{ actionId: tChangeCodeActionId; input: tChangeCodeRequestInput }> = [
        ...(decision.findFiles ?? []).map((query) => ({ actionId: 'find-file' as const, input: { query: query.trim() } })),
        ...(decision.readFiles ?? []).map((path) => ({ actionId: 'read-file' as const, input: { path: path.trim() } })),
        ...(decision.questions ?? []).map((question) => ({ actionId: 'research' as const, input: { question: question.trim() } })),
      ].filter((request) => Object.values(request.input)[0]).slice(0, 3);
      if (requests.length === 0) throw new Error('Missing-information result has no concrete request.');

      const unavailable = requests.find((request) => !actions.includes(request.actionId));
      if (unavailable) {
        throw new Error(`ActionCodeChange requested unavailable action '${unavailable.actionId}'.`);
      }

      return {
        status: 'not-completed',
        reason: decision.reason ?? 'Additional project context is required.',
        canContinue: true,
        requests,
      };
    }

    const edits = (decision.edits ?? []).slice(0, 6);
    if (edits.length === 0) throw new Error('Ready result contains no edits.');
    const normalized: Array<{ path: string; instruction: string }> = [];
    for (const edit of edits) {
      normalized.push({
        path: await this.runtime.fileSystem.resolvePath(edit.path),
        instruction: edit.instruction.trim(),
      });
    }
    return {
      status: 'completed',
      data: {
        summary: decision.summary ?? `Prepared ${normalized.length} project edit intent(s).`,
        edit: { strategy: 'range-replace', edits: normalized },
      },
    };
  }

  private candidateFiles(task: string, context: readonly unknown[]): string[] {
    const paths = new Set<string>();
    for (const item of context) collectPaths(item, paths);
    for (const file of this.runtime.fileIndex.findFiles(task, 16)) paths.add(file.path);
    return [...paths].slice(0, 24);
  }
}

function readInput(input: unknown): sChangeCodeActionInput {
  if (!isRecord(input) || !('task' in input)) {
    return { task: input, context: [], actions: ['read-file'] };
  }

  return {
    task: input.task,
    context: readContext(input.context),
    actions: readActions(input.actions),
  };
}

function readContext(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value)) return Object.values(value);
  return [];
}

function readActions(value: unknown): readonly tChangeCodeActionId[] {
  if (!Array.isArray(value)) return ['read-file'];
  return value.filter(isChangeCodeActionId);
}

function isChangeCodeActionId(value: unknown): value is tChangeCodeActionId {
  return value === 'find-file' || value === 'read-file' || value === 'research';
}

function runtimeDependencies(dependencies: tEngineRunDependencies): ChangeCodeRuntime {
  const target = dependencies.target as { fileSystem?: FileSystem; fileIndex?: iProjectFileIndex } | undefined;
  const model = dependencies.model as ModelRunner | undefined;
  const emit = dependencies.emit as tEngineEmit | undefined;
  const language = dependencies.language as LanguageConfiguration | undefined;
  if (!target?.fileSystem || !target.fileIndex || !model || !emit) {
    throw new Error('ActionCodeChange requires runtime target, model and emit.');
  }
  return {
    fileSystem: target.fileSystem,
    fileIndex: target.fileIndex,
    model,
    emit,
    language: language ?? { project: 'en', nodus: 'en', response: 'en' },
  };
}

function describeTask(task: unknown): string {
  if (typeof task === 'string') return task;
  if (task === undefined) return '';
  try {
    return JSON.stringify(task);
  } catch {
    return String(task);
  }
}

function collectPaths(value: unknown, paths: Set<string>): void {
  if (!isRecord(value)) return;
  if (typeof value.path === 'string') paths.add(value.path);
  if (Array.isArray(value.paths)) {
    for (const path of value.paths) if (typeof path === 'string') paths.add(path);
  }
  const research = value.value;
  if (isRecord(research) && Array.isArray(research.sources)) {
    for (const source of research.sources) {
      if (isRecord(source) && typeof source.path === 'string') paths.add(source.path);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

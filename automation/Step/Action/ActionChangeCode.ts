import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { FileSystem } from '@engine/Common/Tools/FileSystem.js';
import type { iProjectFileIndex } from '@engine/Project/File/Index/ProjectFileIndex.js';
import { EngineStep } from '@engine/Core/EngineStep.js';
import type { sEngineOutput, sEngineSchemaStep } from '@engine/Core/EngineSchemaTsType.js';
import type { tEngineRunDependencies } from '@engine/Core/EngineStepInterface.js';
import { callModel } from '@model/Runner/ModelCaller.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';
import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';
import type { LanguageConfiguration } from '@engine/Type/LanguageConfiguration.js';
import { ModelLanguagePolicy } from '@engine/Common/Language/ModelLanguagePolicy.js';
import { actionCoreResult, readActionCoreData } from './ActionCoreResult.js';
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
  logger: EngineLogger;
  language: LanguageConfiguration;
}

interface ChangeCodeActionData {
  summary: string;
  edit?: {
    strategy: 'range-replace';
    edits: Array<{ path: string; instruction: string }>;
  };
}

type ChangeCodeRequestInput =
  | { query: string }
  | { path: string }
  | { question: string };

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

/** Stateless module definition. Per-run infrastructure is owned by ChangeCodeExecution. */
export class ChangeCodeAction extends EngineStep {
  public getId(): string {
    return 'change-code';
  }

  public getGroup(): string {
    return 'action';
  }

  public async run(
    step: sEngineSchemaStep,
    dependencies: tEngineRunDependencies,
  ): Promise<sEngineOutput> {
    const context = (step.computedContext?.steps ?? [])
      .map((contextStep) => readActionCoreData<unknown>(contextStep.output))
      .filter((item) => item !== undefined);

    try {
      return actionCoreResult(await new ChangeCodeExecution(runtimeDependencies(dependencies)).run(step.task, context));
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
  ): Promise<tActionCoreResult<ChangeCodeActionData, ChangeCodeRequestInput>> {
    const taskText = describeTask(task);
    const decision = await callModel<ChangeDecision>(this.runtime.model, this.runtime.logger, {
      request: {
        message: 'Determine the concrete project edits required to complete the assigned task now.',
        data: {
          task,
          candidateFiles: this.candidateFiles(taskText, context),
          context,
        },
        format: ModelRequestFormat.Json,
        guidance: [
          'Implement the requested software/project behavior change.',
          'Prefer existing project APIs and conventions. Change source code only when required by the task.',
          ...new ModelLanguagePolicy(this.runtime.language).mixedProjectEdit(),
          'Describe what must change. Do not generate patch serialization.',
          'When information is missing, request the cheapest sufficient operation.',
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
      const requests: Array<{ actionId: string; input: ChangeCodeRequestInput }> = [
        ...(decision.findFiles ?? []).map((query) => ({ actionId: 'find-file', input: { query: query.trim() } })),
        ...(decision.readFiles ?? []).map((path) => ({ actionId: 'read-file', input: { path: path.trim() } })),
        ...(decision.questions ?? []).map((question) => ({ actionId: 'research', input: { question: question.trim() } })),
      ].filter((request) => Object.values(request.input)[0]).slice(0, 3);
      if (requests.length === 0) throw new Error('Missing-information result has no concrete request.');
      return { status: 'not-completed', reason: decision.reason ?? 'Additional project context is required.', canContinue: true, requests };
    }

    const edits = (decision.edits ?? []).slice(0, 6);
    if (edits.length === 0) throw new Error('Ready result contains no edits.');
    const normalized: Array<{ path: string; instruction: string }> = [];
    for (const edit of edits) {
      normalized.push({ path: await this.runtime.fileSystem.resolvePath(edit.path), instruction: edit.instruction.trim() });
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

function runtimeDependencies(dependencies: tEngineRunDependencies): ChangeCodeRuntime {
  const target = dependencies.target as { fileSystem?: FileSystem; fileIndex?: iProjectFileIndex } | undefined;
  const model = dependencies.model as ModelRunner | undefined;
  const logger = dependencies.logger as EngineLogger | undefined;
  const language = dependencies.language as LanguageConfiguration | undefined;
  if (!target?.fileSystem || !target.fileIndex || !model || !logger) {
    throw new Error('ActionCodeChange requires runtime target, model and logger.');
  }
  return {
    fileSystem: target.fileSystem,
    fileIndex: target.fileIndex,
    model,
    logger,
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
  if (!value || typeof value !== 'object') return;
  const item = value as Record<string, unknown>;
  if (typeof item.path === 'string') paths.add(item.path);
  if (Array.isArray(item.paths)) for (const path of item.paths) if (typeof path === 'string') paths.add(path);
  const research = item.value;
  if (research && typeof research === 'object' && Array.isArray((research as { sources?: unknown[] }).sources)) {
    for (const source of (research as { sources: unknown[] }).sources) {
      if (source && typeof source === 'object' && typeof (source as { path?: unknown }).path === 'string') {
        paths.add((source as { path: string }).path);
      }
    }
  }
}

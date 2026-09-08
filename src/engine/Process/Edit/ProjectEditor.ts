import type { FileSystem } from '@engine/Common/Tools/FileSystem.js';
import type { tEngineEmit } from '@engine/EngineEvent.js';
import type { EditStrategy } from '@engine/Process/Edit/EditStrategy.js';
import type {
  EditPreparationContext,
  EditPrepareResult,
  EditStrategyId,
  PreparedProjectChange,
  ProjectEditRequest,
  ProjectFileChange,
} from '@engine/Process/Edit/EditTypes.js';
import { EditValidator, type EditCandidate, type EditValidationResult } from '@engine/Process/Edit/Validation/EditValidator.js';

export type ProjectEditResult =
  | { status: 'completed'; files: number; operations: number; strategy: EditStrategyId; paths: string[] }
  | { status: 'not-completed'; reason: string };

interface BufferedFile {
  type: 'update' | 'create';
  path: string;
  original: string;
  current: string;
  strategy: EditStrategyId;
}

export type EditState = ReadonlyMap<string, Readonly<BufferedFile>>;

interface PreparedWithStrategy {
  status: 'completed';
  result: Extract<EditPrepareResult, { status: 'completed' }>;
  strategy: EditStrategy;
}

const DEFAULT_FALLBACKS: Readonly<Record<EditStrategyId, ReadonlyArray<EditStrategyId>>> = {
  'range-replace': ['diff', 'edit'],
  replace: ['diff', 'edit'],
  diff: ['edit'],
  edit: [],
};

const noopEmit: tEngineEmit = () => undefined;

/** Engine-owned task-local edit state over physical file access. */
export class ProjectEditor {
  private readonly strategies = new Map<EditStrategyId, EditStrategy>();
  private files = new Map<string, BufferedFile>();

  public constructor(
    private readonly fileSystem: FileSystem,
    strategies: ReadonlyArray<EditStrategy>,
    private readonly validator: EditValidator = new EditValidator(),
    private readonly fallbacks: Readonly<Record<EditStrategyId, ReadonlyArray<EditStrategyId>>> = DEFAULT_FALLBACKS,
  ) {
    for (const strategy of strategies) this.strategies.set(strategy.id, strategy);
  }

  public async read(path: string): Promise<string> {
    const targetPath = await this.fileSystem.resolveTargetPath(path);
    const buffered = this.files.get(targetPath);
    if (buffered) return buffered.current;

    const projectPath = await this.fileSystem.resolvePath(path);
    return this.fileSystem.read(projectPath);
  }

  public async write(path: string, content: string): Promise<void> {
    const targetPath = await this.fileSystem.resolveTargetPath(path);
    const buffered = this.files.get(targetPath);
    const validation = await this.validator.validate([{ path: targetPath, content }]);
    const failed = validation.filter((result) => result.status === 'failed');
    if (failed.length > 0) throw new Error(this.validationFailureReason(failed));

    if (buffered) {
      buffered.current = content;
      buffered.strategy = 'edit';
      return;
    }

    const projectPath = await this.fileSystem.resolvePath(path);
    const original = await this.fileSystem.read(projectPath);
    this.files.set(projectPath, {
      type: 'update',
      path: projectPath,
      original,
      current: content,
      strategy: 'edit',
    });
  }

  public async change(
    task: unknown,
    step: unknown,
    request: ProjectEditRequest,
    emit: tEngineEmit,
  ): Promise<ProjectEditResult> {
    if (!task || typeof task !== 'object' || typeof (task as { description?: unknown }).description !== 'string') {
      return { status: 'not-completed', reason: 'Edit task must contain description.' };
    }

    const changes = requestChanges(request);
    if (changes.length === 0) {
      return { status: 'completed', files: 0, operations: 0, strategy: request.strategy, paths: [] };
    }
    if (!this.strategies.has(request.strategy)) {
      return { status: 'not-completed', reason: `Unknown edit strategy: ${request.strategy}` };
    }

    const editTask = task as EditPreparationContext['task'];
    const draft = this.cloneFiles(this.files);
    const touched = new Set<string>();
    let operations = 0;
    emit({
      type: 'edit.prepare.start',
      data: { strategy: request.strategy, edits: changes.length, bufferedFiles: this.files.size },
    });

    for (const change of changes) {
      const preparedFile = await this.prepareFile(change, request.strategy, draft);
      if ('reason' in preparedFile) return { status: 'not-completed', reason: preparedFile.reason };

      const { path, file, strategy } = preparedFile;
      touched.add(path);
      emit({ type: 'edit.file.start', data: { strategy, path, operation: change.type } });

      const context: EditPreparationContext = {
        task: editTask,
        step,
        edit: { ...change, path },
        source: file.current,
        emit,
        settings: request.settings,
      };
      const prepared = await this.prepareWithFallback(strategy, context);
      if (prepared.status === 'not-completed') {
        emit({
          type: 'edit.file.failed',
          level: 'warning',
          data: { strategy, path, operation: change.type, reason: prepared.reason },
        });
        return prepared;
      }
      if (prepared.result.path !== path) {
        return {
          status: 'not-completed',
          reason: `Prepared edit path mismatch: expected ${path}, received ${prepared.result.path}`,
        };
      }

      file.current = prepared.result.content;
      file.strategy = prepared.strategy.id;
      operations += prepared.result.operations ?? 1;
      emit({
        type: 'edit.file.finish',
        data: {
          strategy: prepared.strategy.id,
          requestedStrategy: request.strategy,
          path,
          operation: change.type,
          operations: prepared.result.operations,
        },
      });
    }

    const candidates: EditCandidate[] = [...touched]
      .map((path) => draft.get(path))
      .filter((file): file is BufferedFile => (
        file !== undefined && (file.type === 'create' || file.current !== file.original)
      ))
      .map((file) => ({ path: file.path, content: file.current }));
    if (candidates.length === 0) {
      return { status: 'not-completed', reason: 'Edit preparation produced no project changes.' };
    }

    const validation = await this.validator.validate(candidates);
    this.emitValidation(validation, emit);
    const failed = validation.filter((result) => result.status === 'failed');
    if (failed.length > 0) return { status: 'not-completed', reason: this.validationFailureReason(failed) };

    this.files = draft;
    emit({
      type: 'edit.prepare.finish',
      data: {
        strategy: request.strategy,
        files: candidates.length,
        operations,
        bufferedFiles: this.files.size,
        warnings: validation.filter((result) => result.status === 'warning').length,
      },
    });
    return {
      status: 'completed',
      files: candidates.length,
      operations,
      strategy: request.strategy,
      paths: candidates.map((candidate) => candidate.path),
    };
  }

  public state(): EditState { return this.cloneFiles(this.files); }
  public restore(state: EditState): void { this.files = this.cloneFiles(state); }

  public async apply(state: EditState = this.state(), emit: tEngineEmit = noopEmit): Promise<ProjectEditResult> {
    const changes: PreparedProjectChange[] = [...state.values()]
      .filter((file) => file.type === 'create' || file.current !== file.original)
      .map((file): PreparedProjectChange => file.type === 'create'
        ? {
            type: 'create',
            path: file.path,
            content: file.current,
            strategy: file.strategy,
          }
        : {
            type: 'update',
            path: file.path,
            expected: file.original,
            content: file.current,
            strategy: file.strategy,
          });
    if (changes.length === 0) {
      return { status: 'completed', files: 0, operations: 0, strategy: 'edit', paths: [] };
    }

    const commit = await this.commit(changes, emit);
    if (commit.status === 'not-completed') return commit;
    return {
      status: 'completed',
      files: changes.length,
      operations: changes.length,
      strategy: changes.at(-1)?.strategy ?? 'edit',
      paths: commit.paths,
    };
  }

  private async prepareFile(
    change: ProjectFileChange,
    requestedStrategy: EditStrategyId,
    draft: Map<string, BufferedFile>,
  ): Promise<{
    path: string;
    file: BufferedFile;
    strategy: EditStrategyId;
  } | { reason: string }> {
    const targetPath = await this.fileSystem.resolveTargetPath(change.path);
    const buffered = draft.get(targetPath);

    if (change.type === 'create') {
      if (buffered || await this.fileSystem.exists(targetPath)) {
        return { reason: `Create target already exists: ${targetPath}` };
      }

      const strategy: EditStrategyId = this.strategies.has('diff') ? 'diff' : requestedStrategy;
      const file: BufferedFile = {
        type: 'create',
        path: targetPath,
        original: '',
        current: '',
        strategy,
      };
      draft.set(targetPath, file);
      return { path: targetPath, file, strategy };
    }

    if (buffered) {
      return { path: targetPath, file: buffered, strategy: requestedStrategy };
    }

    const path = await this.fileSystem.resolvePath(change.path);
    let file = draft.get(path);
    if (!file) {
      const source = await this.fileSystem.read(path);
      file = {
        type: 'update',
        path,
        original: source,
        current: source,
        strategy: requestedStrategy,
      };
      draft.set(path, file);
    }
    return { path, file, strategy: requestedStrategy };
  }

  private cloneFiles(state: ReadonlyMap<string, Readonly<BufferedFile>>): Map<string, BufferedFile> {
    return new Map([...state.entries()].map(([path, file]) => [path, { ...file }]));
  }

  private emitValidation(results: ReadonlyArray<EditValidationResult>, emit: tEngineEmit): void {
    for (const result of results) {
      if (result.status === 'warning') {
        emit({
          type: 'edit.validation.warning',
          level: 'warning',
          data: { checkId: result.checkId, path: result.path, reason: result.reason },
        });
      } else if (result.status === 'failed') {
        emit({
          type: 'edit.validation.failed',
          level: 'warning',
          data: { checkId: result.checkId, path: result.path, reason: result.reason },
        });
      }
    }
  }

  private validationFailureReason(results: ReadonlyArray<Extract<EditValidationResult, { status: 'failed' }>>): string {
    return results.map((result) => `${result.checkId} (${result.path}): ${result.reason}`).join('\n');
  }

  private async prepareWithFallback(
    requestedStrategyId: EditStrategyId,
    context: EditPreparationContext,
  ): Promise<PreparedWithStrategy | Extract<EditPrepareResult, { status: 'not-completed' }>> {
    const candidates = [requestedStrategyId, ...(this.fallbacks[requestedStrategyId] ?? [])];
    let lastReason = `Unknown edit strategy: ${requestedStrategyId}`;
    for (let index = 0; index < candidates.length; index += 1) {
      const strategyId = candidates[index];
      const strategy = this.strategies.get(strategyId);
      if (!strategy) continue;
      let result: EditPrepareResult;
      try {
        result = await strategy.prepare(context);
      } catch (error) {
        result = { status: 'not-completed', reason: error instanceof Error ? error.message : String(error) };
      }
      if (result.status === 'completed') return { status: 'completed', result, strategy };
      lastReason = result.reason;
      const nextStrategyId = candidates.slice(index + 1).find((candidate) => this.strategies.has(candidate));
      if (nextStrategyId) {
        context.emit({
          type: 'edit.strategy.fallback',
          level: 'warning',
          data: {
            path: context.edit.path,
            fromStrategy: strategy.id,
            toStrategy: nextStrategyId,
            reason: result.reason,
          },
        });
      }
    }
    return { status: 'not-completed', reason: lastReason };
  }

  private async commit(
    changes: ReadonlyArray<PreparedProjectChange>,
    emit: tEngineEmit,
  ): Promise<{ status: 'completed'; files: number; paths: string[] } | { status: 'not-completed'; reason: string }> {
    const unique = new Map<string, PreparedProjectChange>();
    for (const change of changes) {
      const path = await this.fileSystem.resolveTargetPath(change.path);
      if (unique.has(path)) {
        return { status: 'not-completed', reason: `Multiple prepared changes target ${path}.` };
      }
      unique.set(path, { ...change, path });
    }

    for (const change of unique.values()) {
      if (change.type === 'create') {
        if (await this.fileSystem.exists(change.path)) {
          return { status: 'not-completed', reason: `Create target already exists: ${change.path}` };
        }
        continue;
      }

      if (!await this.fileSystem.exists(change.path)) {
        return {
          status: 'not-completed',
          reason: `Prepared change is stale for ${change.path}; project file no longer exists.`,
        };
      }
      const current = await this.fileSystem.read(change.path);
      if (current !== change.expected) {
        return {
          status: 'not-completed',
          reason: `Prepared change is stale for ${change.path}; project content changed before commit.`,
        };
      }
    }

    emit({ type: 'edit.commit.start', data: { files: unique.size } });
    const written: PreparedProjectChange[] = [];
    try {
      for (const change of unique.values()) {
        await this.fileSystem.write(change.path, change.content);
        written.push(change);
      }
    } catch (error) {
      for (const change of written.reverse()) {
        try {
          if (change.type === 'create') await this.fileSystem.remove(change.path);
          else await this.fileSystem.write(change.path, change.expected);
        } catch (rollbackError) {
          emit({
            type: 'edit.rollback.failed',
            level: 'error',
            data: {
              path: change.path,
              error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
            },
          });
        }
      }
      return { status: 'not-completed', reason: error instanceof Error ? error.message : String(error) };
    }

    emit({ type: 'edit.commit.finish', data: { files: unique.size } });
    return { status: 'completed', files: unique.size, paths: [...unique.keys()] };
  }
}

function requestChanges(request: ProjectEditRequest): ProjectFileChange[] {
  if (request.changes) return [...request.changes];
  return (request.edits ?? []).map((edit) => ({
    type: 'update' as const,
    path: edit.path,
    instruction: edit.instruction,
  }));
}

export type { PreparedProjectChange } from '@engine/Process/Edit/EditTypes.js';

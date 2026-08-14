import type { Project } from '@engine/Project/Project.js';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import { EditPresentation } from '@engine/Presentation/EditPresentation.js';
import type { EditStrategy } from '@engine/Edit/EditStrategy.js';
import type { EditStrategyId, PreparedProjectChange, ProjectEditRequest, EditPrepareResult, EditPreparationContext } from '@engine/Edit/EditTypes.js';
import type { PlanStep } from '@engine/Planner/Plan.js';
import type { Task } from '@engine/Task/Task.js';

export type ProjectEditResult =
  | { status: 'completed'; files: number; operations: number; strategy: EditStrategyId; paths: string[] }
  | { status: 'not-completed'; reason: string };

interface BufferedFile {
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

/**
 * Engine-owned task-local edit state.
 * Worker receives this object as a temporary execution tool; apply/restore ownership remains with Engine.
 */
export class ProjectEditor {
  public readonly presentation = new EditPresentation();
  private readonly strategies = new Map<EditStrategyId, EditStrategy>();
  private files = new Map<string, BufferedFile>();

  public constructor(
    private readonly project: Project,
    private readonly logger: EngineLogger,
    strategies: ReadonlyArray<EditStrategy>,
    private readonly fallbacks: Readonly<Record<EditStrategyId, ReadonlyArray<EditStrategyId>>> = DEFAULT_FALLBACKS,
  ) {
    for (const strategy of strategies) this.strategies.set(strategy.id, strategy);
  }

  /** Read task-local content first, then fall back to the physical Project. */
  public async read(path: string): Promise<string> {
    const projectPath = await this.project.resolvePath(path);
    return this.files.get(projectPath)?.current ?? this.project.read(projectPath);
  }

  /**
   * Store already materialized file content in the task-local state.
   * This is primarily an adapter for Worker tools that already operate on complete file content.
   * Create/delete semantics are intentionally not handled yet.
   */
  public async write(path: string, content: string): Promise<void> {
    const projectPath = await this.project.resolvePath(path);
    const existing = this.files.get(projectPath);
    if (existing) {
      existing.current = content;
      existing.strategy = 'edit';
      return;
    }

    const original = await this.project.read(projectPath);
    this.files.set(projectPath, {
      path: projectPath,
      original,
      current: content,
      strategy: 'edit',
    });
  }

  /** Add one semantic edit request to the current task-local state without writing Project files. */
  public async change(task: Task, step: PlanStep, request: ProjectEditRequest): Promise<ProjectEditResult> {
    if (request.edits.length === 0) {
      return { status: 'completed', files: 0, operations: 0, strategy: request.strategy, paths: [] };
    }
    if (!this.strategies.has(request.strategy)) {
      return { status: 'not-completed', reason: `Unknown edit strategy: ${request.strategy}` };
    }

    const touched = new Set<string>();
    let operations = 0;
    this.logger.info('engine.edit.prepare.start', {
      strategy: request.strategy,
      edits: request.edits.length,
      bufferedFiles: this.files.size,
      presentation: this.presentation,
    });

    for (const edit of request.edits) {
      const path = await this.project.resolvePath(edit.path);
      touched.add(path);

      let file = this.files.get(path);
      if (!file) {
        const source = await this.project.read(path);
        file = { path, original: source, current: source, strategy: request.strategy };
        this.files.set(path, file);
      }

      this.logger.info('engine.edit.file.start', {
        strategy: request.strategy,
        path,
        presentation: this.presentation,
      });

      const context: EditPreparationContext = {
        task,
        step,
        edit: { ...edit, path },
        source: file.current,
        settings: request.settings,
      };
      const prepared = await this.prepareWithFallback(request.strategy, context);
      if (prepared.status === 'not-completed') {
        this.logger.warn('engine.edit.file.failed', {
          strategy: request.strategy,
          path,
          reason: prepared.reason,
          presentation: this.presentation,
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
      this.logger.info('engine.edit.file.finish', {
        strategy: prepared.strategy.id,
        requestedStrategy: request.strategy,
        path,
        operations: prepared.result.operations,
        presentation: this.presentation,
      });
    }

    const changedPaths = [...touched].filter((path) => {
      const file = this.files.get(path);
      return file && file.current !== file.original;
    });
    if (changedPaths.length === 0) {
      return { status: 'not-completed', reason: 'Edit preparation produced no project changes.' };
    }

    this.logger.info('engine.edit.prepare.finish', {
      strategy: request.strategy,
      files: changedPaths.length,
      operations,
      bufferedFiles: this.files.size,
      presentation: this.presentation,
    });
    return {
      status: 'completed',
      files: changedPaths.length,
      operations,
      strategy: request.strategy,
      paths: changedPaths,
    };
  }

  /** Snapshot the accumulated task-local changes for step-level rollback. */
  public state(): EditState {
    return new Map([...this.files.entries()].map(([path, file]) => [path, { ...file }]));
  }

  /** Restore a previously captured task-local state. */
  public restore(state: EditState): void {
    this.files = new Map([...state.entries()].map(([path, file]) => [path, { ...file }]));
  }

  /** Physically write the accumulated task-local changes to Project. */
  public async apply(state: EditState = this.state()): Promise<ProjectEditResult> {
    const changes: PreparedProjectChange[] = [...state.values()]
      .filter((file) => file.current !== file.original)
      .map((file) => ({
        path: file.path,
        expected: file.original,
        content: file.current,
        strategy: file.strategy,
      }));

    if (changes.length === 0) {
      return { status: 'completed', files: 0, operations: 0, strategy: 'edit', paths: [] };
    }

    const commit = await this.commit(changes);
    if (commit.status === 'not-completed') return commit;
    return {
      status: 'completed',
      files: changes.length,
      operations: changes.length,
      strategy: changes.at(-1)?.strategy ?? 'edit',
      paths: commit.paths,
    };
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
        this.logger.warn('engine.edit.strategy.fallback', {
          path: context.edit.path,
          fromStrategy: strategy.id,
          toStrategy: nextStrategyId,
          reason: result.reason,
          presentation: this.presentation,
        });
      }
    }

    return { status: 'not-completed', reason: lastReason };
  }

  private async commit(
    changes: ReadonlyArray<PreparedProjectChange>,
  ): Promise<{ status: 'completed'; files: number; paths: string[] } | { status: 'not-completed'; reason: string }> {
    const unique = new Map<string, PreparedProjectChange>();
    for (const change of changes) {
      const path = await this.project.resolvePath(change.path);
      if (unique.has(path)) return { status: 'not-completed', reason: `Multiple prepared changes target ${path}.` };
      unique.set(path, { ...change, path });
    }

    for (const change of unique.values()) {
      await this.project.resolveTargetPath(change.path);
      const current = await this.project.read(change.path);
      if (current !== change.expected) {
        return {
          status: 'not-completed',
          reason: `Prepared change is stale for ${change.path}; project content changed before commit.`,
        };
      }
    }

    this.logger.info('engine.edit.commit.start', { files: unique.size, presentation: this.presentation });
    const written: PreparedProjectChange[] = [];
    try {
      for (const change of unique.values()) {
        await this.project.write(change.path, change.content);
        written.push(change);
      }
    } catch (error) {
      for (const change of written.reverse()) {
        try {
          await this.project.write(change.path, change.expected);
        } catch (rollbackError) {
          this.logger.error('engine.edit.rollback.failed', {
            path: change.path,
            error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          });
        }
      }
      return { status: 'not-completed', reason: error instanceof Error ? error.message : String(error) };
    }

    this.logger.info('engine.edit.commit.finish', { files: unique.size, presentation: this.presentation });
    return { status: 'completed', files: unique.size, paths: [...unique.keys()] };
  }
}

export type { PreparedProjectChange } from '@engine/Edit/EditTypes.js';

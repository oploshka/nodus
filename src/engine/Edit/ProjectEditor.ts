import type { Project } from '@engine/Project/Project.js';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import { EditPresentation } from '@engine/Presentation/EditPresentation.js';
import type { EditStrategy } from '@engine/Edit/EditStrategy.js';
import type { EditStrategyId, PreparedProjectChange, ProjectEditRequest } from '@engine/Edit/EditTypes.js';
import type { PlanStep } from '@engine/Planner/Plan.js';
import type { Task } from '@engine/Task/Task.js';

export type ProjectEditResult =
  | { status: 'completed'; files: number; operations: number; strategy: EditStrategyId }
  | { status: 'not-completed'; reason: string };

interface BufferedFile { path: string; original: string; current: string }

/** Engine-owned edit boundary: serialize intent, prepare in memory, validate as a set, then commit atomically. */
export class ProjectEditor {
  public readonly presentation = new EditPresentation();
  private readonly strategies = new Map<EditStrategyId, EditStrategy>();

  public constructor(
    private readonly project: Project,
    private readonly logger: EngineLogger,
    strategies: ReadonlyArray<EditStrategy>,
  ) {
    for (const strategy of strategies) this.strategies.set(strategy.id, strategy);
  }

  public async apply(task: Task, step: PlanStep, request: ProjectEditRequest): Promise<ProjectEditResult> {
    if (request.edits.length === 0) return { status: 'completed', files: 0, operations: 0, strategy: request.strategy };
    const strategy = this.strategies.get(request.strategy);
    if (!strategy) return { status: 'not-completed', reason: `Unknown edit strategy: ${request.strategy}` };

    const files = new Map<string, BufferedFile>();
    const uniquePaths = new Set<string>();
    for (const edit of request.edits) uniquePaths.add(await this.project.resolvePath(edit.path));
    this.logger.info('engine.edit.prepare.start', { strategy: strategy.id, files: uniquePaths.size, edits: request.edits.length, presentation: this.presentation });

    let operations = 0;
    for (const edit of request.edits) {
      const path = await this.project.resolvePath(edit.path);
      let file = files.get(path);
      if (!file) {
        const source = await this.project.read(path);
        file = { path, original: source, current: source };
        files.set(path, file);
      }

      this.logger.info('engine.edit.file.start', { strategy: strategy.id, path, presentation: this.presentation });
      let prepared;
      try {
        prepared = await strategy.prepare({ task, step, edit: { ...edit, path }, source: file.current, settings: request.settings });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn('engine.edit.file.failed', { strategy: strategy.id, path, reason, presentation: this.presentation });
        this.logger.warn('engine.edit.prepare.failed', { strategy: strategy.id, path, presentation: this.presentation });
        return { status: 'not-completed', reason: `${strategy.id} could not prepare ${path}: ${reason}` };
      }
      if (prepared.status === 'not-completed') {
        this.logger.warn('engine.edit.file.failed', { strategy: strategy.id, path, reason: prepared.reason, presentation: this.presentation });
        this.logger.warn('engine.edit.prepare.failed', { strategy: strategy.id, path, presentation: this.presentation });
        return prepared;
      }
      if (prepared.path !== path) return { status: 'not-completed', reason: `Prepared edit path mismatch: expected ${path}, received ${prepared.path}` };
      file.current = prepared.content;
      operations += prepared.operations ?? 1;
      this.logger.info('engine.edit.file.finish', { strategy: strategy.id, path, operations: prepared.operations, presentation: this.presentation });
    }

    const changes: PreparedProjectChange[] = [...files.values()]
      .filter((file) => file.current !== file.original)
      .map((file) => ({ path: file.path, expected: file.original, content: file.current, strategy: strategy.id }));
    if (changes.length === 0) return { status: 'not-completed', reason: 'Edit preparation produced no project changes.' };

    const commit = await this.commit(changes);
    if (commit.status === 'not-completed') return commit;
    return { status: 'completed', files: changes.length, operations, strategy: strategy.id };
  }

  private async commit(changes: ReadonlyArray<PreparedProjectChange>): Promise<{ status: 'completed'; files: number } | { status: 'not-completed'; reason: string }> {
    const unique = new Map<string, PreparedProjectChange>();
    for (const change of changes) {
      const path = await this.project.resolvePath(change.path);
      if (unique.has(path)) return { status: 'not-completed', reason: `Multiple prepared changes target ${path}.` };
      unique.set(path, { ...change, path });
    }

    for (const change of unique.values()) {
      await this.project.resolveTargetPath(change.path);
      const current = await this.project.read(change.path);
      if (current !== change.expected) return { status: 'not-completed', reason: `Prepared change is stale for ${change.path}; project content changed before commit.` };
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
        try { await this.project.write(change.path, change.expected); }
        catch (rollbackError) {
          this.logger.error('engine.edit.rollback.failed', { path: change.path, error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError) });
        }
      }
      return { status: 'not-completed', reason: error instanceof Error ? error.message : String(error) };
    }

    this.logger.info('engine.edit.commit.finish', { files: unique.size, presentation: this.presentation });
    return { status: 'completed', files: unique.size };
  }
}

export type { PreparedProjectChange } from '@engine/Edit/EditTypes.js';

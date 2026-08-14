export interface TaskExecutionMetrics {
  durationMs: number;
  planSteps: number;
  completedSteps: number;
  modelCalls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  researchRequests: number;
  researchCacheHits: number;
  workerAttempts: number;
  editFiles: number;
  editOperations: number;
  strategies: Record<string, number>;
}

/**
 * Aggregates structured execution metrics from the same runtime events that are
 * already emitted for diagnostics. It performs no model calls and owns no UI.
 */
export class TaskExecutionMetricsTracker {
  private startedAt = 0;
  private planSteps = 0;
  private completedSteps = 0;
  private modelCalls = 0;
  private promptTokens = 0;
  private completionTokens = 0;
  private totalTokens = 0;
  private researchRequests = 0;
  private researchCacheHits = 0;
  private workerAttempts = 0;
  private readonly editFiles = new Set<string>();
  private editOperations = 0;
  private readonly strategies = new Map<string, number>();

  public observe(event: string, data?: unknown): void {
    const record = isRecord(data) ? data : {};

    if (event === 'engine.task.start') {
      this.reset();
      this.startedAt = performance.now();
      return;
    }

    if (event === 'engine.plan') {
      this.planSteps = Array.isArray(record.steps) ? record.steps.length : 0;
      return;
    }

    if (event === 'engine.step.finish') {
      if (record.status === 'completed') this.completedSteps += 1;
      return;
    }

    if (event === 'model.run' || event === 'model.run.error' || event.endsWith('.model.run') || event.endsWith('.model.run.error')) {
      const meta = isRecord(record.meta) ? record.meta : {};
      this.modelCalls += 1;
      this.promptTokens += numberValue(meta.promptTokens);
      this.completionTokens += numberValue(meta.completionTokens);
      this.totalTokens += numberValue(meta.totalTokens);
      return;
    }

    if (event === 'worker.action.start') {
      const actionId = stringValue(record.actionId);
      if (actionId === 'research') this.researchRequests += 1;
      else this.workerAttempts += 1;
      return;
    }

    if (event === 'research.hit') {
      this.researchCacheHits += 1;
      return;
    }

    if (event === 'engine.edit.file.finish') {
      const path = stringValue(record.path);
      const strategy = stringValue(record.strategy);
      if (path) this.editFiles.add(path);
      this.editOperations += numberValue(record.operations);
      if (strategy) this.strategies.set(strategy, (this.strategies.get(strategy) ?? 0) + 1);
    }
  }

  public snapshot(): TaskExecutionMetrics {
    return {
      durationMs: this.startedAt > 0 ? performance.now() - this.startedAt : 0,
      planSteps: this.planSteps,
      completedSteps: this.completedSteps,
      modelCalls: this.modelCalls,
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      totalTokens: this.totalTokens,
      researchRequests: this.researchRequests,
      researchCacheHits: this.researchCacheHits,
      workerAttempts: this.workerAttempts,
      editFiles: this.editFiles.size,
      editOperations: this.editOperations,
      strategies: Object.fromEntries(this.strategies),
    };
  }

  private reset(): void {
    this.startedAt = 0;
    this.planSteps = 0;
    this.completedSteps = 0;
    this.modelCalls = 0;
    this.promptTokens = 0;
    this.completionTokens = 0;
    this.totalTokens = 0;
    this.researchRequests = 0;
    this.researchCacheHits = 0;
    this.workerAttempts = 0;
    this.editFiles.clear();
    this.editOperations = 0;
    this.strategies.clear();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function stringValue(value: unknown): string { return typeof value === 'string' ? value : ''; }
function numberValue(value: unknown): number { return typeof value === 'number' ? value : 0; }

import { describe, expect, it } from 'vitest';
import { TaskExecutionMetricsTracker } from '@engine/Metrics/TaskExecutionMetrics.js';

describe('TaskExecutionMetricsTracker', () => {
  it('aggregates runtime events without a model summary call', () => {
    const tracker = new TaskExecutionMetricsTracker();
    tracker.observe('engine.task.start', { taskId: 't1' });
    tracker.observe('engine.plan', { steps: [{ id: '1' }, { id: '2' }] });
    tracker.observe('model.run', { meta: { promptTokens: 100, completionTokens: 20, totalTokens: 120 } });
    tracker.observe('engine.edit.model.model.run', { meta: { promptTokens: 200, completionTokens: 30, totalTokens: 230 } });
    tracker.observe('worker.action.start', { actionId: 'change-code' });
    tracker.observe('worker.action.start', { actionId: 'research' });
    tracker.observe('research.hit');
    tracker.observe('engine.edit.file.finish', { path: 'a.ts', operations: 2, strategy: 'range-replace' });
    tracker.observe('engine.edit.file.finish', { path: 'b.ts', operations: 1, strategy: 'diff' });
    tracker.observe('engine.step.finish', { status: 'completed' });

    const metrics = tracker.snapshot();
    expect(metrics.planSteps).toBe(2);
    expect(metrics.completedSteps).toBe(1);
    expect(metrics.modelCalls).toBe(2);
    expect(metrics.promptTokens).toBe(300);
    expect(metrics.completionTokens).toBe(50);
    expect(metrics.totalTokens).toBe(350);
    expect(metrics.researchRequests).toBe(1);
    expect(metrics.researchCacheHits).toBe(1);
    expect(metrics.workerAttempts).toBe(1);
    expect(metrics.editFiles).toBe(2);
    expect(metrics.editOperations).toBe(3);
    expect(metrics.strategies).toEqual({ 'range-replace': 1, diff: 1 });
  });
});

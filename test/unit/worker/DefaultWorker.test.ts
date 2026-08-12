import { describe, expect, it } from 'vitest';
import { NullLogger } from '../../../src/app/logging/Logger.js';
import { Task } from '../../../src/engine/task/Task.js';
import { DefaultWorker } from '../../../src/engine/worker/DefaultWorker.js';
import type { ExecutionDecision, ExecutionPlanner } from '../../../src/engine/worker/ExecutionPlanner.js';
import type { ExecutionAction } from '../../../src/engine/worker/action/ExecutionAction.js';

class SequenceExecutionPlanner implements ExecutionPlanner {
  public constructor(private readonly decisions: ExecutionDecision[]) {}
  public async next(): Promise<ExecutionDecision> {
    const decision = this.decisions.shift();
    if (!decision) throw new Error('No scripted decision');
    return decision;
  }
}

describe('DefaultWorker', () => {
  it('aggregates planner and available actions', async () => {
    const calls: string[] = [];
    const action: ExecutionAction = {
      id: 'note',
      description: 'record a note',
      maxUses: 1,
      async execute(input) {
        calls.push(String((input as { value: string }).value));
        return { status: 'completed', summary: 'noted', data: input };
      },
    };
    const worker = new DefaultWorker(
      new SequenceExecutionPlanner([
        { type: 'action', actionId: 'note', input: { value: 'x' } },
        { type: 'completed', summary: 'done' },
      ]),
      [action],
      new NullLogger(),
      4,
    );

    const result = await worker.execute(new Task('task', 'p'), { id: 's1', goal: 'goal', constraints: [] });
    expect(result.status).toBe('completed');
    expect(calls).toEqual(['x']);
    expect(result.state.history).toHaveLength(1);
    expect(result.state.history[0].actionId).toBe('note');
  });

  it('enforces action usage limit outside ExecutionPlanner', async () => {
    const action: ExecutionAction = {
      id: 'research',
      description: 'research',
      maxUses: 1,
      async execute() { return { status: 'completed', summary: 'ok' }; },
    };
    const worker = new DefaultWorker(
      new SequenceExecutionPlanner([
        { type: 'action', actionId: 'research', input: { question: 'a' } },
        { type: 'action', actionId: 'research', input: { question: 'b' } },
      ]),
      [action],
      new NullLogger(),
      4,
    );

    const result = await worker.execute(new Task('task', 'p'), { id: 's1', goal: 'goal', constraints: [] });
    expect(result.status).toBe('failed');
    if (result.status === 'failed') expect(result.error).toMatch(/limit exceeded/);
  });
});

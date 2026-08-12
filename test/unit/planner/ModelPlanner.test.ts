import { describe, expect, it } from 'vitest';
import { NullLogger } from '@app/Logging/Logger.js';
import type { ModelAdapter } from '@model/Adapter/ModelAdapter.js';
import { ModelRunner } from '@model/Runner/ModelRunner.js';
import { ModelPlanner } from '@engine/Planner/ModelPlanner.js';
import { Task } from '@engine/Task/Task.js';

class SingleResponseAdapter implements ModelAdapter {
  public constructor(private readonly content: string) {}

  public async complete() {
    return { content: this.content, finishReason: 'stop' };
  }
}

describe('ModelPlanner', () => {
  it('owns step ids instead of requiring the model to invent them', async () => {
    const runner = new ModelRunner(
      new SingleResponseAdapter('{"steps":[{"goal":"Make the change"}]}'),
      { provider: 'openai-compatible', endpoint: 'unused', model: 'test' },
    );
    const planner = new ModelPlanner(runner, new NullLogger());

    const plan = await planner.plan(new Task('Do something', 'project'));

    expect(plan.steps).toEqual([
      {
        id: 'step-1',
        goal: 'Make the change',
        constraints: [],
        knowledgeImpact: undefined,
      },
    ]);
  });
});

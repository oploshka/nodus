import { describe, expect, it } from 'vitest';
import { NullLogger } from '@app/Logging/Logger.js';
import type { ModelAdapter, RawModelResponse } from '@model/Adapter/ModelAdapter.js';
import type { ModelRequest } from '@model/Request/ModelRequest.js';
import { ModelRunner } from '@model/Runner/ModelRunner.js';
import { ModelPlanner } from '@engine/Planner/ModelPlanner.js';
import { Task } from '@engine/Task/Task.js';

class CapturingResponseAdapter implements ModelAdapter {
  public request?: ModelRequest;

  public constructor(private readonly content: string) {}

  public async complete(request: ModelRequest): Promise<RawModelResponse> {
    this.request = request;
    return { content: this.content, finishReason: 'stop' };
  }
}

function createPlannerResponse(step: Record<string, unknown>): string {
  return JSON.stringify({ steps: [step] });
}

describe('ModelPlanner', () => {
  it('owns step ids and keeps decomposition metadata from the model', async () => {
    const adapter = new CapturingResponseAdapter(createPlannerResponse({
      goal: 'Make the change',
      constraints: [],
      decompositionType: 'coherent-outcome',
    }));
    const runner = new ModelRunner(
      adapter,
      { provider: 'openai-compatible', endpoint: 'unused', model: 'test' },
    );
    const planner = new ModelPlanner(runner, new NullLogger());

    const plan = await planner.plan(new Task('Do something', 'project'));

    expect(plan.steps).toEqual([
      {
        id: 'step-1',
        goal: 'Make the change',
        constraints: [],
        decompositionType: 'coherent-outcome',
        knowledgeImpact: undefined,
      },
    ]);
  });

  it('describes the allowed decomposition reasons in the model contract', async () => {
    const adapter = new CapturingResponseAdapter(createPlannerResponse({
      goal: 'Make the change',
      constraints: [],
      decompositionType: 'coherent-outcome',
    }));
    const runner = new ModelRunner(
      adapter,
      { provider: 'openai-compatible', endpoint: 'unused', model: 'test' },
    );
    const planner = new ModelPlanner(runner, new NullLogger());

    await planner.plan(new Task('Do something', 'project'));

    const system = adapter.request?.messages.find((message) => message.role === 'system')?.content ?? '';
    expect(system).toContain('coherent-outcome');
    expect(system).toContain('independent-outcome');
    expect(system).toContain('dependency');
    expect(system).toContain('separate-deliverable');
    expect(system).toContain('implementation layers, files');
    expect(system).toContain('Default to exactly one PlanStep');
  });

  it('uses language.nodus for the model-facing plan contract', async () => {
    const adapter = new CapturingResponseAdapter(createPlannerResponse({
      goal: 'Make the change',
      constraints: [],
      decompositionType: 'coherent-outcome',
    }));
    const runner = new ModelRunner(
      adapter,
      { provider: 'openai-compatible', endpoint: 'unused', model: 'test' },
    );
    const planner = new ModelPlanner(runner, new NullLogger(), 'en');

    await planner.plan(new Task('Сделай изменение', 'project'));

    const system = adapter.request?.messages.find((message) => message.role === 'system')?.content ?? '';
    expect(system).toContain('Use en for all machine-facing Nodus fields');
  });

  it('requires constraints instead of silently dropping them', async () => {
    const runner = new ModelRunner(
      new CapturingResponseAdapter(createPlannerResponse({
        goal: 'Make the change',
        decompositionType: 'coherent-outcome',
      })),
      { provider: 'openai-compatible', endpoint: 'unused', model: 'test' },
    );
    const planner = new ModelPlanner(runner, new NullLogger());

    await expect(planner.plan(new Task('Do something', 'project')))
      .rejects.toThrow('steps[0].constraints');
  });

  it('rejects arbitrary decomposition reasons outside the fixed option list', async () => {
    const runner = new ModelRunner(
      new CapturingResponseAdapter(createPlannerResponse({
        goal: 'Make the change',
        constraints: [],
        decompositionType: 'change-code',
      })),
      { provider: 'openai-compatible', endpoint: 'unused', model: 'test' },
    );
    const planner = new ModelPlanner(runner, new NullLogger());

    await expect(planner.plan(new Task('Do something', 'project')))
      .rejects.toThrow("Unknown option 'change-code'");
  });
});

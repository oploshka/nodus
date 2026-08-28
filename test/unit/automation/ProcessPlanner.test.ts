import { describe, expect, it } from 'vitest';
import { PlannerProcessModule, ReplanProcessModule } from '@engine/Automation/ProcessPlanner.js';
import type { iProcessPlanner, sProcessPlanningRequest } from '@engine/Automation/ProcessPlanner.js';

class CapturingPlanner implements iProcessPlanner {
  public readonly requests: sProcessPlanningRequest[] = [];

  public async plan(request: sProcessPlanningRequest) {
    this.requests.push(request);
    return {
      kind: 'sequence' as const,
      id: request.mode === 'plan' ? 'planned' : 'repair',
      variables: ['task'],
      input: { task: 'task' },
      steps: [],
    };
  }
}

describe('process planner modules', () => {
  it('turns a nested task into a schema through Planner', async () => {
    const planner = new CapturingPlanner();
    const module = new PlannerProcessModule(planner);

    const result = await module.execute(
      { task: 'Implement A1' },
      { node: { id: 'plan-a1', kind: 'action' } },
    );

    expect(planner.requests).toEqual([{ task: 'Implement A1', mode: 'plan' }]);
    expect(result.status).toBe('completed');
    expect(result.process?.id).toBe('planned');
  });

  it('passes failure data to Planner when Replan is requested', async () => {
    const planner = new CapturingPlanner();
    const module = new ReplanProcessModule(planner);
    const failure = { status: 'failed', reason: 'typecheck failed' };

    const result = await module.execute(
      { task: 'Implement A1', failure },
      { node: { id: 'replan-a1', kind: 'action' } },
    );

    expect(planner.requests).toEqual([{ task: 'Implement A1', mode: 'replan', failure }]);
    expect(result.process?.id).toBe('repair');
  });
});

import { describe, expect, it } from 'vitest';
import {
  PlanProcessModule,
  QualifyProcessModule,
  ReplanProcessModule,
  type iProcessPlanner,
  type sProcessPlanningRequest,
  type sProcessReplanningRequest,
} from '@engine/Automation/ProcessPlanner.js';
import {
  ACTION,
  STEP,
  TASK_TYPE,
  type sProcessExecutionContext,
} from '@engine/Automation/ProcessSchema.js';

class CapturingPlanner implements iProcessPlanner {
  public readonly planRequests: sProcessPlanningRequest[] = [];
  public readonly replanRequests: sProcessReplanningRequest[] = [];

  public constructor(private readonly type: TASK_TYPE = TASK_TYPE.SIMPLE) {}

  public async qualify(_task: string, _context: sProcessExecutionContext): Promise<TASK_TYPE> {
    return this.type;
  }

  public async plan(request: sProcessPlanningRequest) {
    this.planRequests.push(request);
    return [
      {
        type: STEP.WORKER as const,
        task: 'planned semantic task',
      },
    ];
  }

  public async replan(request: sProcessReplanningRequest) {
    this.replanRequests.push(request);
    return [
      {
        type: STEP.WORKER as const,
        task: 'repair task',
      },
    ];
  }
}

const rootContext = (overrides: Partial<sProcessExecutionContext> = {}): sProcessExecutionContext => ({
  parent: 'Original task',
  steps: {},
  step: 1,
  path: [1],
  ...overrides,
});

describe('process planner modules v2', () => {
  it('QUALIFY classifies the self-contained parent task', async () => {
    const planner = new CapturingPlanner(TASK_TYPE.MULTI);
    const module = new QualifyProcessModule(planner);

    const result = await module.execute(
      { type: STEP.QUALIFY },
      rootContext(),
    );

    expect(result).toEqual({ status: 'SUCCESS', value: TASK_TYPE.MULTI });
  });

  it('PLAN uses the previous QUALIFY result and returns semantic steps', async () => {
    const planner = new CapturingPlanner();
    const module = new PlanProcessModule(planner);
    const context = rootContext({
      previous: { status: 'SUCCESS', value: TASK_TYPE.PROCESS },
      step: 2,
      path: [2],
    });

    const result = await module.execute({ type: STEP.PLAN }, context);

    expect(planner.planRequests[0]?.task).toBe('Original task');
    expect(planner.planRequests[0]?.type).toBe(TASK_TYPE.PROCESS);
    expect(result.value).toEqual([{ type: STEP.WORKER, task: 'planned semantic task' }]);
  });

  it('REPLAN receives the failed previous step and returns a replacement tail', async () => {
    const planner = new CapturingPlanner();
    const module = new ReplanProcessModule(planner);
    const failure = { status: 'FAILURE' as const, reason: 'typecheck failed' };
    const context = rootContext({
      previous: failure,
      step: 4,
      path: [4],
    });

    const result = await module.execute({ type: STEP.REPLAN }, context);

    expect(planner.replanRequests[0]?.failure).toEqual(failure);
    expect(result.value).toEqual([{ type: STEP.WORKER, task: 'repair task' }]);
  });

  it('does not allow PLAN to decompose semantic work into ACTION steps', async () => {
    const planner: iProcessPlanner = {
      qualify: async () => TASK_TYPE.MULTI,
      plan: async () => [
        {
          type: STEP.ACTION,
          action: ACTION.ASK_USER,
        },
      ],
      replan: async () => [],
    };
    const module = new PlanProcessModule(planner);
    const context = rootContext({
      previous: { status: 'SUCCESS', value: TASK_TYPE.MULTI },
      step: 2,
      path: [2],
    });

    await expect(module.execute({ type: STEP.PLAN }, context)).rejects.toThrow('cannot plan ACTION steps');
  });
});

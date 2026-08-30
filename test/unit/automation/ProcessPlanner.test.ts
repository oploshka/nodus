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
  MODULE_RESULT,
  STEP,
  type sProcessExecutionContext,
} from '@engine/Automation/ProcessSchema.js';

const TASK_TYPE = {
  SIMPLE: 'SIMPLE',
  MULTI: 'MULTI',
  PROCESS: 'PROCESS',
} as const;

type tTaskType = typeof TASK_TYPE[keyof typeof TASK_TYPE];

class CapturingPlanner implements iProcessPlanner {
  public readonly planRequests: sProcessPlanningRequest[] = [];
  public readonly replanRequests: sProcessReplanningRequest[] = [];

  public constructor(private readonly type: tTaskType = TASK_TYPE.SIMPLE) {}

  public async qualify(_task: string, _context: sProcessExecutionContext): Promise<string> {
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
  it('QUALIFY returns classifier output without owning classifier vocabulary', async () => {
    const planner = new CapturingPlanner(TASK_TYPE.MULTI);
    const module = new QualifyProcessModule(planner);

    const result = await module.execute(
      { type: STEP.QUALIFY },
      rootContext(),
    );

    expect(result).toEqual({
      type: MODULE_RESULT.OUTPUT,
      output: { status: 'SUCCESS', value: TASK_TYPE.MULTI },
    });
  });

  it('PLAN uses the previous qualification and returns an executable schema', async () => {
    const planner = new CapturingPlanner();
    const module = new PlanProcessModule(planner);
    const context = rootContext({
      previous: { status: 'SUCCESS', value: TASK_TYPE.PROCESS },
      step: 2,
      path: [2],
    });

    const result = await module.execute({ type: STEP.PLAN }, context);

    expect(planner.planRequests[0]?.task).toBe('Original task');
    expect(planner.planRequests[0]?.qualification).toBe(TASK_TYPE.PROCESS);
    expect(result).toEqual({
      type: MODULE_RESULT.SCHEMA,
      schema: {
        type: STEP.SEQUENCE,
        task: 'Original task',
        steps: [{ type: STEP.WORKER, task: 'planned semantic task' }],
      },
    });
  });

  it('REPLAN receives the failed previous step and returns an executable schema', async () => {
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
    expect(result).toEqual({
      type: MODULE_RESULT.SCHEMA,
      schema: {
        type: STEP.SEQUENCE,
        task: 'Original task',
        steps: [{ type: STEP.WORKER, task: 'repair task' }],
      },
    });
  });

  it('does not allow PLAN to decompose semantic work into ACTION steps', async () => {
    const planner: iProcessPlanner = {
      qualify: async () => TASK_TYPE.MULTI,
      plan: async () => [
        {
          type: STEP.ACTION,
          action: 'ASK_USER',
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

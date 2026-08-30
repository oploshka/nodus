import {
  STEP,
  TASK_TYPE,
  type iProcessModule,
  type sProcessExecutionContext,
  type sProcessOutput,
  type tProcessExecutableStep,
  type tProcessStep,
} from './ProcessSchema.js';

export interface sProcessPlanningRequest {
  task: string;
  type: TASK_TYPE;
  context: sProcessExecutionContext;
}

export interface sProcessReplanningRequest {
  task: string;
  failure: sProcessOutput;
  context: sProcessExecutionContext;
}

/**
 * Planner intelligence is split into atomic runtime steps. The reusable
 * Planner itself is a schema that composes QUALIFY and PLAN.
 */
export interface iProcessPlanner {
  qualify(task: string, context: sProcessExecutionContext): Promise<TASK_TYPE>;
  plan(request: sProcessPlanningRequest): Promise<tProcessStep[]>;
  replan(request: sProcessReplanningRequest): Promise<tProcessStep[]>;
}

export class QualifyProcessModule implements iProcessModule {
  public readonly type = STEP.QUALIFY;

  public constructor(private readonly planner: iProcessPlanner) {}

  public async execute(
    step: tProcessExecutableStep,
    context: sProcessExecutionContext,
  ): Promise<sProcessOutput> {
    const task = requireTask(step.task ?? context.parent);
    const type = await this.planner.qualify(task, context);
    return { status: 'SUCCESS', value: type };
  }
}

export class PlanProcessModule implements iProcessModule {
  public readonly type = STEP.PLAN;

  public constructor(private readonly planner: iProcessPlanner) {}

  public async execute(
    step: tProcessExecutableStep,
    context: sProcessExecutionContext,
  ): Promise<sProcessOutput> {
    const task = requireTask(step.task ?? context.parent);
    const type = requireTaskType(context.previous?.value);
    const steps = await this.planner.plan({ task, type, context });
    assertPlannerSteps(steps);
    return { status: 'SUCCESS', value: steps };
  }
}

export class ReplanProcessModule implements iProcessModule {
  public readonly type = STEP.REPLAN;

  public constructor(private readonly planner: iProcessPlanner) {}

  public async execute(
    step: tProcessExecutableStep,
    context: sProcessExecutionContext,
  ): Promise<sProcessOutput> {
    const task = requireTask(step.task ?? context.parent);
    const failure = context.previous;
    if (!failure || failure.status !== 'FAILURE') {
      throw new Error('REPLAN requires the failed previous step in input.context.previous.');
    }

    const steps = await this.planner.replan({ task, failure, context });
    assertPlannerSteps(steps);
    return { status: 'SUCCESS', value: steps };
  }
}

function requireTask(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Planner step requires a non-empty self-contained task.');
  }
  return value;
}

function requireTaskType(value: unknown): TASK_TYPE {
  if (value === TASK_TYPE.SIMPLE || value === TASK_TYPE.MULTI || value === TASK_TYPE.PROCESS) return value;
  throw new Error('PLAN requires TASK_TYPE from the previous QUALIFY step.');
}

function assertPlannerSteps(steps: ReadonlyArray<tProcessStep>): void {
  for (const step of steps) {
    if (step.type === STEP.ACTION) {
      throw new Error('PLAN may create semantic steps, but cannot plan ACTION steps.');
    }
    if (step.type === STEP.SEQUENCE) assertPlannerSteps(step.steps);
  }
}

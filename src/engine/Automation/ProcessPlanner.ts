import {
  MODULE_RESULT,
  STEP,
  type iProcessModule,
  type sProcessExecutionContext,
  type sProcessOutput,
  type tProcessExecutableStep,
  type tProcessModuleResult,
  type tProcessStep,
} from './ProcessSchema.js';

export interface sProcessPlanningRequest {
  task: string;
  qualification: string;
  context: sProcessExecutionContext;
}

export interface sProcessReplanningRequest {
  task: string;
  failure: sProcessOutput;
  context: sProcessExecutionContext;
}

export interface iProcessPlanner {
  qualify(task: string, context: sProcessExecutionContext): Promise<string>;
  plan(request: sProcessPlanningRequest): Promise<tProcessStep[]>;
  replan(request: sProcessReplanningRequest): Promise<tProcessStep[]>;
}

export class QualifyProcessModule implements iProcessModule {
  public readonly type = STEP.QUALIFY;

  public constructor(private readonly planner: iProcessPlanner) {}

  public async execute(
    step: tProcessExecutableStep,
    context: sProcessExecutionContext,
  ): Promise<tProcessModuleResult> {
    const task = requireTask(step.task ?? context.parent);
    const qualification = await this.planner.qualify(task, context);
    return {
      type: MODULE_RESULT.OUTPUT,
      output: { status: 'SUCCESS', value: qualification },
    };
  }
}

export class PlanProcessModule implements iProcessModule {
  public readonly type = STEP.PLAN;

  public constructor(private readonly planner: iProcessPlanner) {}

  public async execute(
    step: tProcessExecutableStep,
    context: sProcessExecutionContext,
  ): Promise<tProcessModuleResult> {
    const task = requireTask(step.task ?? context.parent);
    const qualification = requireQualification(context.previous?.value);
    const steps = await this.planner.plan({ task, qualification, context });
    assertPlannerSteps(steps);

    return {
      type: MODULE_RESULT.SCHEMA,
      schema: {
        type: STEP.SEQUENCE,
        task,
        steps,
      },
    };
  }
}

export class ReplanProcessModule implements iProcessModule {
  public readonly type = STEP.REPLAN;

  public constructor(private readonly planner: iProcessPlanner) {}

  public async execute(
    step: tProcessExecutableStep,
    context: sProcessExecutionContext,
  ): Promise<tProcessModuleResult> {
    const task = requireTask(step.task ?? context.parent);
    const failure = context.previous;
    if (!failure || failure.status !== 'FAILURE') {
      throw new Error('REPLAN requires the failed previous step in input.context.previous.');
    }

    const steps = await this.planner.replan({ task, failure, context });
    assertPlannerSteps(steps);

    return {
      type: MODULE_RESULT.SCHEMA,
      schema: {
        type: STEP.SEQUENCE,
        task,
        steps,
      },
    };
  }
}

function requireTask(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Planner step requires a non-empty self-contained task.');
  }
  return value;
}

function requireQualification(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  throw new Error('PLAN requires a qualification from the previous QUALIFY step.');
}

function assertPlannerSteps(steps: ReadonlyArray<tProcessStep>): void {
  for (const step of steps) {
    if (step.type === STEP.ACTION) {
      throw new Error('PLAN may create semantic steps, but cannot plan ACTION steps.');
    }
    if (step.type === STEP.SEQUENCE) assertPlannerSteps(step.steps);
  }
}

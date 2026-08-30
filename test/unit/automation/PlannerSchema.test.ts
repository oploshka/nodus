import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AutomationLoader } from '@engine/Automation/AutomationLoader.js';
import {
  PlanProcessModule,
  QualifyProcessModule,
  ReplanProcessModule,
  type iProcessPlanner,
  type sProcessPlanningRequest,
  type sProcessReplanningRequest,
} from '@engine/Automation/ProcessPlanner.js';
import { ProcessRuntime } from '@engine/Automation/ProcessRuntime.js';
import {
  STEP,
  TASK_TYPE,
  type iProcessModule,
  type sProcessExecutionContext,
  type sProcessInput,
  type sProcessOutput,
  type sProcessSchema,
  type tProcessExecutableStep,
  type tProcessStep,
} from '@engine/Automation/ProcessSchema.js';

class SchemaPlanner implements iProcessPlanner {
  public planCalls = 0;

  public constructor(private readonly taskType: TASK_TYPE) {}

  public async qualify(): Promise<TASK_TYPE> {
    return this.taskType;
  }

  public async plan(_request: sProcessPlanningRequest): Promise<tProcessStep[]> {
    this.planCalls += 1;
    return [
      { type: STEP.WORKER, task: 'Research JSON' },
      { type: STEP.WORKER, task: 'Research YAML' },
      { type: STEP.WORKER, task: 'Research JavaScript' },
      {
        type: STEP.WORKER,
        task: 'Compare and choose',
        input: { context: { parent: true, steps: [1, 2, 3] } },
      },
    ];
  }

  public async replan(_request: sProcessReplanningRequest): Promise<tProcessStep[]> {
    return [];
  }
}

class SchemaWorker implements iProcessModule {
  public readonly type = STEP.WORKER;
  public readonly calls: Array<{ step: tProcessExecutableStep; context: sProcessExecutionContext }> = [];

  public async execute(
    step: tProcessExecutableStep,
    context: sProcessExecutionContext,
  ): Promise<sProcessOutput> {
    this.calls.push({ step, context });
    return { status: 'SUCCESS', value: step.task ?? context.parent };
  }
}

describe('automation planner schema', () => {
  it('routes SIMPLE directly from QUALIFY to one WORKER', async () => {
    const schema = await loadPlannerSchema();
    const planner = new SchemaPlanner(TASK_TYPE.SIMPLE);
    const worker = new SchemaWorker();
    const runtime = createRuntime(planner, worker);

    const result = await runtime.run(schema, 'One self-contained task');

    expect(result.status).toBe('SUCCESS');
    expect(planner.planCalls).toBe(0);
    expect(schema.steps.map((step) => step.type)).toEqual([STEP.QUALIFY, STEP.WORKER]);
    expect(worker.calls[0]?.context.parent).toBe('One self-contained task');
  });

  it('routes MULTI through PLAN and restarts numbering in a nested semantic sequence', async () => {
    const schema = await loadPlannerSchema();
    const planner = new SchemaPlanner(TASK_TYPE.MULTI);
    const worker = new SchemaWorker();
    const runtime = createRuntime(planner, worker);

    const result = await runtime.run(schema, 'Compare configuration formats');

    expect(result.status).toBe('SUCCESS');
    expect(planner.planCalls).toBe(1);
    expect(schema.steps.map((step) => step.type)).toEqual([STEP.QUALIFY, STEP.PLAN, STEP.SEQUENCE]);

    const planned = schema.steps[2];
    expect(planned?.type).toBe(STEP.SEQUENCE);
    if (planned?.type !== STEP.SEQUENCE) throw new Error('Expected nested planned sequence.');
    expect(planned.steps.map((step) => step.type)).toEqual([
      STEP.WORKER,
      STEP.WORKER,
      STEP.WORKER,
      STEP.WORKER,
    ]);

    const summaryCall = worker.calls[3];
    expect(summaryCall?.context.path).toEqual([3, 4]);
    expect(summaryCall?.context.parent).toBe('Compare configuration formats');
    expect(Object.keys(summaryCall?.context.steps ?? {})).toEqual(['1', '2', '3']);
  });
});

function createRuntime(planner: iProcessPlanner, worker: iProcessModule): ProcessRuntime {
  return new ProcessRuntime([
    new QualifyProcessModule(planner),
    new PlanProcessModule(planner),
    new ReplanProcessModule(planner),
    worker,
  ]);
}

async function loadPlannerSchema(): Promise<sProcessSchema> {
  const automation = await AutomationLoader.load(resolve('automation'));
  const schema = automation.schemas.planner;
  if (!schema) throw new Error('automation schema planner is not registered');
  return cloneStep(schema) as sProcessSchema;
}

function cloneStep(step: tProcessStep): tProcessStep {
  const input = cloneInput(step.input);
  if (step.type === STEP.SEQUENCE) {
    return {
      ...step,
      input,
      output: undefined,
      steps: step.steps.map(cloneStep),
    };
  }

  return {
    ...step,
    input,
    output: undefined,
  };
}

function cloneInput(input: sProcessInput | undefined): sProcessInput | undefined {
  if (!input) return undefined;
  if (!input.context) return {};
  return {
    context: {
      ...input.context,
      steps: input.context.steps ? [...input.context.steps] : undefined,
    },
  };
}

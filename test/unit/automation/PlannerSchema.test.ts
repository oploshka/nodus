import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AutomationLoader } from '@engine/Automation/AutomationLoader.js';
import {
  PlanProcessModule,
  QualifyProcessModule,
  ReplanProcessModule,
} from '@engine/Planner/PlannerModule.js';
import type {
  iProcessPlanner,
  sProcessPlanningRequest,
  sProcessReplanningRequest,
} from '@engine/Planner/PlannerTsType.js';
import { ProcessRuntime } from '@engine/Process/ProcessRuntime.js';
import { MODULE_RESULT, STEP } from '@engine/Process/ProcessSchema.js';
import type {
  sProcessInput,
  sProcessSchema,
  tProcessStep,
} from '@engine/Process/ProcessTsType.js';
import { WorkerRunner } from '@engine/Worker/WorkerRunner.js';
import { WorkerSchema } from '@engine/Worker/WorkerSchema.js';
import type { sWorkerRequest, tWorkerResult } from '@engine/Worker/WorkerTsType.js';

const TASK_TYPE = { SIMPLE: 'SIMPLE', MULTI: 'MULTI', PROCESS: 'PROCESS' } as const;
type tTaskType = typeof TASK_TYPE[keyof typeof TASK_TYPE];

class SchemaPlanner implements iProcessPlanner {
  public planCalls = 0;
  public constructor(private readonly taskType: tTaskType) {}
  public async qualify(): Promise<string> { return this.taskType; }
  public async plan(_request: sProcessPlanningRequest): Promise<tProcessStep[]> {
    this.planCalls += 1;
    return [
      { type: STEP.WORKER, task: 'Research JSON' },
      { type: STEP.WORKER, task: 'Research YAML' },
      { type: STEP.WORKER, task: 'Research JavaScript' },
      { type: STEP.WORKER, task: 'Compare and choose', input: { context: { parent: true, steps: [1, 2, 3] } } },
    ];
  }
  public async replan(_request: sProcessReplanningRequest): Promise<tProcessStep[]> { return []; }
}

class SchemaWorker extends WorkerRunner {
  public readonly calls: sWorkerRequest[] = [];

  public constructor() {
    super(new WorkerSchema({ id: 'schema-test' }));
  }

  public async run(request: sWorkerRequest): Promise<tWorkerResult> {
    this.calls.push(request);
    return {
      type: MODULE_RESULT.OUTPUT,
      output: { status: 'SUCCESS', value: request.task },
    };
  }
}

describe('automation PlannerTask schema', () => {
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
    expect(worker.calls[0]?.task).toBe('One self-contained task');
  });

  it('routes MULTI through PLAN and executes its returned local schema', async () => {
    const schema = await loadPlannerSchema();
    const planner = new SchemaPlanner(TASK_TYPE.MULTI);
    const worker = new SchemaWorker();
    const runtime = createRuntime(planner, worker);

    const result = await runtime.run(schema, 'Compare configuration formats');

    expect(result.status).toBe('SUCCESS');
    expect(planner.planCalls).toBe(1);
    expect(schema.steps.map((step) => step.type)).toEqual([STEP.QUALIFY, STEP.PLAN]);

    const planStep = schema.steps[1];
    expect(planStep?.type).toBe(STEP.PLAN);
    if (planStep?.type !== STEP.PLAN) throw new Error('Expected PLAN step.');
    expect(planStep.schema?.steps.map((step) => step.type)).toEqual([
      STEP.WORKER, STEP.WORKER, STEP.WORKER, STEP.WORKER,
    ]);

    const summaryCall = worker.calls[3];
    expect(summaryCall?.context.path).toEqual([2, 4]);
    expect(summaryCall?.context.parent).toBe('Compare configuration formats');
    expect(summaryCall?.context.steps.map((ref) => ref.number)).toEqual([1, 2, 3]);
    expect(summaryCall?.context.steps.map((ref) => ref.output.value)).toEqual([
      'Research JSON', 'Research YAML', 'Research JavaScript',
    ]);
    expect(planStep.output?.value).toBe('Compare and choose');
    expect(result.output?.value).toBe('Compare and choose');
  });
});

function createRuntime(planner: iProcessPlanner, worker: WorkerRunner): ProcessRuntime {
  return new ProcessRuntime([
    new QualifyProcessModule(planner),
    new PlanProcessModule(planner),
    new ReplanProcessModule(planner),
    worker,
  ]);
}

async function loadPlannerSchema(): Promise<sProcessSchema> {
  const automation = await AutomationLoader.load(resolve('automation'));
  const definition = automation.PlannerTask as { schema?: unknown };
  const schema = definition.schema;
  if (!schema || typeof schema !== 'object' || (schema as { type?: unknown }).type !== STEP.SEQUENCE) {
    throw new Error('automation PlannerTask schema is not registered');
  }
  return cloneStep(schema as sProcessSchema) as sProcessSchema;
}

function cloneStep(step: tProcessStep): tProcessStep {
  const input = cloneInput(step.input);
  if (step.type === STEP.SEQUENCE) {
    return { ...step, input, output: undefined, steps: step.steps.map(cloneStep) };
  }
  return { ...step, input, output: undefined, schema: undefined };
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

import { describe, expect, it } from 'vitest';
import { ProcessRuntime } from '@engine/Automation/ProcessRuntime.js';
import {
  STEP,
  TASK_TYPE,
  type iProcessModule,
  type sProcessExecutionContext,
  type sProcessOutput,
  type sProcessSchema,
  type tProcessExecutableStep,
} from '@engine/Automation/ProcessSchema.js';

class TestModule implements iProcessModule {
  public readonly calls: Array<{ step: tProcessExecutableStep; context: sProcessExecutionContext }> = [];

  public constructor(
    public readonly type: STEP,
    private readonly handler: (
      step: tProcessExecutableStep,
      context: sProcessExecutionContext,
    ) => Promise<sProcessOutput> | sProcessOutput,
  ) {}

  public async execute(
    step: tProcessExecutableStep,
    context: sProcessExecutionContext,
  ): Promise<sProcessOutput> {
    this.calls.push({ step, context });
    return this.handler(step, context);
  }
}

describe('ProcessRuntime v2', () => {
  it('builds a step context only from parent, previous and selected local steps', async () => {
    const worker = new TestModule(STEP.WORKER, (_step, context) => ({
      status: 'SUCCESS',
      value: `worker-${context.step}`,
    }));
    const runtime = new ProcessRuntime([worker]);
    const schema: sProcessSchema = {
      type: STEP.SEQUENCE,
      steps: [
        {
          type: STEP.WORKER,
          input: { context: { parent: true } },
        },
        {
          type: STEP.WORKER,
          input: { context: { parent: true, previous: true } },
        },
        {
          type: STEP.WORKER,
          input: { context: { parent: true, previous: true, steps: [1] } },
        },
      ],
    };

    const result = await runtime.run(schema, 'root task');

    expect(result.status).toBe('SUCCESS');
    expect(worker.calls[2]?.context).toEqual({
      parent: 'root task',
      previous: { status: 'SUCCESS', value: 'worker-2' },
      steps: {
        1: { status: 'SUCCESS', value: 'worker-1' },
      },
      step: 3,
      path: [3],
    });
  });

  it('keeps parent knowledge local when entering a nested sequence', async () => {
    const worker = new TestModule(STEP.WORKER, (_step, context) => ({
      status: 'SUCCESS',
      value: context.parent,
    }));
    const runtime = new ProcessRuntime([worker]);
    const schema: sProcessSchema = {
      type: STEP.SEQUENCE,
      steps: [
        {
          type: STEP.SEQUENCE,
          task: 'self-contained child task',
          steps: [
            {
              type: STEP.WORKER,
              input: { context: { parent: true } },
            },
            {
              type: STEP.WORKER,
              input: { context: { parent: true, previous: true } },
            },
          ],
        },
      ],
    };

    await runtime.run(schema, 'root task that child must not see');

    expect(worker.calls[0]?.context.parent).toBe('self-contained child task');
    expect(worker.calls[1]?.context.parent).toBe('self-contained child task');
    expect(worker.calls[0]?.context.path).toEqual([1, 1]);
    expect(worker.calls[1]?.context.path).toEqual([1, 2]);
  });

  it('lets transition rewrite only the tail of the current local plan', async () => {
    const qualify = new TestModule(STEP.QUALIFY, () => ({
      status: 'SUCCESS',
      value: TASK_TYPE.SIMPLE,
    }));
    const worker = new TestModule(STEP.WORKER, (step) => ({
      status: 'SUCCESS',
      value: step.task,
    }));
    const runtime = new ProcessRuntime([qualify, worker]);
    let transitionPlan: sProcessSchema | undefined;
    let transitionStep: number | undefined;

    const schema: sProcessSchema = {
      type: STEP.SEQUENCE,
      steps: [
        {
          type: STEP.QUALIFY,
          transition: (plan, step) => {
            transitionPlan = plan;
            transitionStep = step;
            plan.steps.splice(step, plan.steps.length - step, {
              type: STEP.WORKER,
              task: 'simple task',
            });
          },
        },
        {
          type: STEP.WORKER,
          task: 'old tail',
        },
      ],
    };

    const result = await runtime.run(schema);

    expect(result.status).toBe('SUCCESS');
    expect(transitionPlan).toBe(schema);
    expect(transitionStep).toBe(1);
    expect(schema.steps).toHaveLength(2);
    expect(schema.steps[1]?.task).toBe('simple task');
    expect(worker.calls[0]?.step.task).toBe('simple task');
  });

  it('keeps a failed step as history and can recover by replacing its tail with REPLAN', async () => {
    const validate = new TestModule(STEP.VALIDATE, () => ({
      status: 'FAILURE',
      reason: 'validation failed',
    }));
    const replan = new TestModule(STEP.REPLAN, () => ({
      status: 'SUCCESS',
      value: [
        {
          type: STEP.WORKER,
          task: 'repair validation failure',
        },
      ],
    }));
    const worker = new TestModule(STEP.WORKER, (step) => ({
      status: 'SUCCESS',
      value: step.task,
    }));
    const runtime = new ProcessRuntime([validate, replan, worker]);

    const schema: sProcessSchema = {
      type: STEP.SEQUENCE,
      steps: [
        {
          type: STEP.VALIDATE,
          transition: (plan, step) => {
            if (plan.steps[step - 1]?.output?.status !== 'FAILURE') return;
            plan.steps.splice(step, plan.steps.length - step, {
              type: STEP.REPLAN,
              input: { context: { parent: true, previous: true } },
              transition: (localPlan, replanStep) => {
                const next = localPlan.steps[replanStep - 1]?.output?.value;
                if (!Array.isArray(next)) throw new Error('Expected replanned steps.');
                localPlan.steps.splice(replanStep, localPlan.steps.length - replanStep, ...next);
              },
            });
          },
        },
      ],
    };

    const result = await runtime.run(schema, 'original task');

    expect(result.status).toBe('SUCCESS');
    expect(schema.steps[0]?.output).toEqual({ status: 'FAILURE', reason: 'validation failed' });
    expect(replan.calls[0]?.context.previous).toEqual({ status: 'FAILURE', reason: 'validation failed' });
    expect(schema.steps.map((step) => step.type)).toEqual([STEP.VALIDATE, STEP.REPLAN, STEP.WORKER]);
    expect(worker.calls[0]?.step.task).toBe('repair validation failure');
  });

  it('rejects references to future or nonexistent local steps', async () => {
    const worker = new TestModule(STEP.WORKER, () => ({ status: 'SUCCESS' }));
    const runtime = new ProcessRuntime([worker]);
    const schema: sProcessSchema = {
      type: STEP.SEQUENCE,
      steps: [
        {
          type: STEP.WORKER,
          input: { context: { steps: [2] } },
        },
      ],
    };

    await expect(runtime.run(schema)).rejects.toThrow('cannot read unavailable local step 2');
  });
});

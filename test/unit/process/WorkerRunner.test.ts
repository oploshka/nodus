import { describe, expect, it } from 'vitest';
import { MODULE_RESULT, STEP } from '@engine/Process/ProcessSchema.js';
import type { sProcessExecutionContext } from '@engine/Process/ProcessTsType.js';
import { WorkerMethod } from '@engine/Worker/WorkerMethod.js';
import { WorkerRunner } from '@engine/Worker/WorkerRunner.js';
import { WorkerSchema } from '@engine/Worker/WorkerSchema.js';
import type { sWorkerRequest, sWorkerSchema, tWorkerResult } from '@engine/Worker/WorkerTsType.js';

class TestMethodWorker extends WorkerMethod {
  public request?: sWorkerRequest;

  public getId(): string {
    return 'method';
  }

  public async run(request: sWorkerRequest): Promise<tWorkerResult> {
    this.request = request;
    return {
      type: MODULE_RESULT.OUTPUT,
      output: { status: 'SUCCESS', value: request.task },
    };
  }
}

class TestSchemaWorker extends WorkerSchema {
  public constructor(private readonly schema: sWorkerSchema) {
    super();
  }

  public getId(): string {
    return 'schema';
  }

  public getSchema(): sWorkerSchema {
    return this.schema;
  }
}

const context: sProcessExecutionContext = {
  parent: 'parent task',
  steps: [],
  step: 1,
  path: [1],
};

describe('WorkerRunner', () => {
  it('delegates METHOD Workers to their custom run implementation', async () => {
    const worker = new TestMethodWorker();
    const runner = new WorkerRunner(worker);

    const result = await runner.execute({ type: runner.type, task: 'implement change' }, context);

    expect(worker.request?.task).toBe('implement change');
    expect(worker.request?.context).toBe(context);
    expect(result).toEqual({
      type: MODULE_RESULT.OUTPUT,
      output: { status: 'SUCCESS', value: 'implement change' },
    });
  });

  it('returns a SCHEMA Worker implementation back to ProcessRuntime', async () => {
    const schema: sWorkerSchema = {
      type: STEP.SEQUENCE,
      steps: [],
    };
    const runner = new WorkerRunner(new TestSchemaWorker(schema));

    const result = await runner.execute({ type: runner.type, task: 'implement change' }, context);

    expect(result).toEqual({
      type: MODULE_RESULT.SCHEMA,
      schema,
    });
  });

  it('uses parent input as the task when WORKER step has no explicit task', async () => {
    const worker = new TestMethodWorker();
    const runner = new WorkerRunner(worker);

    await runner.execute({ type: runner.type }, context);

    expect(worker.request?.task).toBe('parent task');
  });
});

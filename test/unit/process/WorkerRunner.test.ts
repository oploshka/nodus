import { describe, expect, it } from 'vitest';
import { MODULE_RESULT } from '@engine/Process/ProcessSchema.js';
import type { sProcessExecutionContext } from '@engine/Process/ProcessTsType.js';
import { WorkerRunner } from '@engine/Worker/WorkerRunner.js';
import { WorkerSchema } from '@engine/Worker/WorkerSchema.js';
import type { sWorkerRequest, tWorkerResult } from '@engine/Worker/WorkerTsType.js';

class TestWorker extends WorkerRunner {
  public request?: sWorkerRequest;

  public async run(request: sWorkerRequest): Promise<tWorkerResult> {
    this.request = request;
    return {
      type: MODULE_RESULT.OUTPUT,
      output: { status: 'SUCCESS', value: request.task },
    };
  }
}

const context: sProcessExecutionContext = {
  parent: 'parent task',
  steps: [],
  step: 1,
  path: [1],
};

describe('WorkerRunner', () => {
  it('binds a WorkerSchema and delegates process execution to custom run behavior', async () => {
    const schema = new WorkerSchema({
      id: 'code',
      prompt: 'prompt',
      actions: ['read-file', 'change-code'],
      limits: { attempts: 5 },
    });
    const worker = new TestWorker(schema);

    const result = await worker.execute({ type: worker.type, task: 'implement change' }, context);

    expect(worker.schema).toBe(schema);
    expect(worker.request?.task).toBe('implement change');
    expect(worker.request?.context).toBe(context);
    expect(result).toEqual({
      type: MODULE_RESULT.OUTPUT,
      output: { status: 'SUCCESS', value: 'implement change' },
    });
  });

  it('uses parent input as the task when WORKER step has no explicit task', async () => {
    const worker = new TestWorker(new WorkerSchema({ id: 'code' }));

    await worker.execute({ type: worker.type }, context);

    expect(worker.request?.task).toBe('parent task');
  });
});

import { describe, expect, it } from 'vitest';
import { MODULE_RESULT, STEP } from '@engine/Process/ProcessSchema.js';
import type { sProcessExecutionContext } from '@engine/Process/ProcessTsType.js';
import { WorkerMethod } from '@engine/Step/Worker/Contract/WorkerMethod.js';
import { WorkerSchema } from '@engine/Step/Worker/Contract/WorkerSchema.js';
import type { sWorkerRequest, sWorkerSchema, tWorkerResult } from '@engine/Step/Worker/Contract/WorkerTsType.js';
import { WorkerRunner } from '@engine/Step/Worker/WorkerRunner.js';
import { QualifierMethod } from '@engine/Step/Qualifier/Contract/QualifierMethod.js';
import type { sQualifierRequest, tQualifierResult } from '@engine/Step/Qualifier/Contract/QualifierTsType.js';
import { QualifierRunner } from '@engine/Step/Qualifier/QualifierRunner.js';
import { ActionMethod } from '@engine/Step/Action/Contract/ActionMethod.js';
import type { sActionRequest, tActionResult } from '@engine/Step/Action/Contract/ActionTsType.js';
import { ActionRunner } from '@engine/Step/Action/ActionRunner.js';

const context: sProcessExecutionContext = {
  parent: 'parent task',
  steps: [],
  step: 1,
  path: [1],
};

class MethodWorker extends WorkerMethod {
  public request?: sWorkerRequest;
  public getId(): string { return 'method'; }
  public async run(request: sWorkerRequest): Promise<tWorkerResult> {
    this.request = request;
    return { type: MODULE_RESULT.OUTPUT, output: { status: 'SUCCESS', value: request.task } };
  }
}

class SchemaWorker extends WorkerSchema {
  public getId(): string { return 'schema'; }
  public getSchema(): sWorkerSchema { return { type: STEP.SEQUENCE, steps: [] }; }
}

class TaskQualifier extends QualifierMethod {
  public request?: sQualifierRequest;
  public getId(): string { return 'task'; }
  public async run(request: sQualifierRequest): Promise<tQualifierResult> {
    this.request = request;
    return { type: MODULE_RESULT.OUTPUT, output: { status: 'SUCCESS', value: 'SIMPLE' } };
  }
}

class TestAction extends ActionMethod {
  public request?: sActionRequest;
  public constructor(private readonly id: string) { super(); }
  public getId(): string { return this.id; }
  public async run(request: sActionRequest): Promise<tActionResult> {
    this.request = request;
    return { type: MODULE_RESULT.OUTPUT, output: { status: 'SUCCESS', value: request.action } };
  }
}

describe('Process Step execution roles', () => {
  it('runs a WORKER METHOD through shared ProcessStepRunner mechanics', async () => {
    const worker = new MethodWorker();
    const runner = new WorkerRunner([worker]);

    const result = await runner.execute({ type: STEP.WORKER, task: 'implement change' }, context);

    expect(worker.request).toEqual({ type: STEP.WORKER, task: 'implement change', context });
    expect(result).toEqual({ type: MODULE_RESULT.OUTPUT, output: { status: 'SUCCESS', value: 'implement change' } });
  });

  it('returns a WORKER SCHEMA to ProcessRuntime', async () => {
    const runner = new WorkerRunner([new SchemaWorker()]);
    const result = await runner.execute({ type: STEP.WORKER, task: 'implement change' }, context);

    expect(result).toEqual({ type: MODULE_RESULT.SCHEMA, schema: { type: STEP.SEQUENCE, steps: [] } });
  });

  it('binds QUALIFY as a first-class semantic role', async () => {
    const qualifier = new TaskQualifier();
    const runner = new QualifierRunner([qualifier]);

    const result = await runner.execute({ type: STEP.QUALIFY, task: 'classify task' }, context);

    expect(qualifier.request?.type).toBe(STEP.QUALIFY);
    expect(result).toEqual({ type: MODULE_RESULT.OUTPUT, output: { status: 'SUCCESS', value: 'SIMPLE' } });
  });

  it('uses ACTION.action as implementation id instead of preset', async () => {
    const read = new TestAction('read');
    const write = new TestAction('write');
    const runner = new ActionRunner([read, write]);

    const result = await runner.execute({ type: STEP.ACTION, action: 'write', task: 'change project' }, context);

    expect(read.request).toBeUndefined();
    expect(write.request?.action).toBe('write');
    expect(result).toEqual({ type: MODULE_RESULT.OUTPUT, output: { status: 'SUCCESS', value: 'write' } });
  });
});

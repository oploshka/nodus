import { describe, expect, it } from 'vitest';
import { ProcessRuntime } from '@engine/Automation/ProcessRuntime.js';
import type {
  iProcessModule,
  sProcessExecutionContext,
  sProcessModuleResult,
  sProcessSchema,
} from '@engine/Automation/ProcessSchema.js';

class TestModule implements iProcessModule {
  public readonly calls: Array<{ input: Readonly<Record<string, unknown>>; context: sProcessExecutionContext }> = [];

  public constructor(
    public readonly id: string,
    private readonly handler: (
      input: Readonly<Record<string, unknown>>,
      context: sProcessExecutionContext,
    ) => Promise<sProcessModuleResult> | sProcessModuleResult,
  ) {}

  public async execute(
    input: Readonly<Record<string, unknown>>,
    context: sProcessExecutionContext,
  ): Promise<sProcessModuleResult> {
    this.calls.push({ input, context });
    return this.handler(input, context);
  }
}

describe('ProcessRuntime', () => {
  it('passes explicitly wired results between actions', async () => {
    const worker = new TestModule('worker', () => ({
      status: 'completed',
      value: { changedPaths: ['src/a.ts'] },
    }));
    const validate = new TestModule('validate', (input) => ({
      status: 'completed',
      value: { checked: input.changes },
    }));
    const runtime = new ProcessRuntime([worker, validate]);
    const schema: sProcessSchema = {
      kind: 'sequence',
      id: 'code-change',
      variables: ['task', 'implementation', 'validation'],
      steps: [
        {
          kind: 'action',
          id: 'implement',
          use: 'worker',
          preset: 'code',
          input: { task: 'task' },
          saveAs: 'implementation',
        },
        {
          kind: 'action',
          id: 'validate',
          use: 'validate',
          input: { changes: 'implementation.value' },
          saveAs: 'validation',
        },
      ],
    };

    const result = await runtime.run(schema, { task: 'Change A' });

    expect(result.status).toBe('completed');
    expect(validate.calls[0]?.input).toEqual({ changes: { changedPaths: ['src/a.ts'] } });
    expect(result.variables.implementation).toEqual({
      status: 'completed',
      value: { changedPaths: ['src/a.ts'] },
    });
  });

  it('creates an explicit child scope for a nested sequence and exports selected values', async () => {
    const worker = new TestModule('worker', (input) => ({ status: 'completed', value: `${input.task}:done` }));
    const runtime = new ProcessRuntime([worker]);
    const schema: sProcessSchema = {
      kind: 'sequence',
      id: 'root',
      variables: ['task', 'childResult'],
      steps: [
        {
          kind: 'sequence',
          id: 'child',
          variables: ['task', 'result'],
          input: { task: 'task' },
          output: { childResult: 'result' },
          steps: [
            {
              kind: 'action',
              id: 'child-worker',
              use: 'worker',
              input: { task: 'task' },
              saveAs: 'result',
            },
          ],
        },
      ],
    };

    const result = await runtime.run(schema, { task: 'A1' });

    expect(result.variables.childResult).toEqual({ status: 'completed', value: 'A1:done' });
    const childWorkerTrace = result.trace.find((entry) => entry.node.id === 'child-worker' && entry.status === 'started');
    expect(childWorkerTrace?.parent).toEqual({ id: 'child', kind: 'sequence' });
  });

  it('can route a failed action through Replan and execute the process returned by it', async () => {
    const validate = new TestModule('validate', () => ({
      status: 'failed',
      reason: 'TypeScript error',
    }));
    const repairWorker = new TestModule('worker', (input, context) => ({
      status: 'completed',
      value: { task: input.task, preset: context.preset },
    }));
    const replan = new TestModule('replan', (input) => ({
      status: 'completed',
      value: { reason: (input.failure as { reason?: string }).reason },
      process: {
        kind: 'sequence',
        id: 'repair-process',
        variables: ['task', 'repair'],
        input: { task: 'task' },
        steps: [
          {
            kind: 'action',
            id: 'repair',
            use: 'worker',
            preset: 'repair',
            input: { task: 'task' },
            saveAs: 'repair',
          },
        ],
      },
    }));
    const runtime = new ProcessRuntime([validate, repairWorker, replan]);
    const schema: sProcessSchema = {
      kind: 'sequence',
      id: 'code-change',
      variables: ['task', 'validation', 'replan'],
      steps: [
        {
          kind: 'action',
          id: 'validate',
          use: 'validate',
          saveAs: 'validation',
          onFailure: [
            {
              kind: 'action',
              id: 'replan',
              use: 'replan',
              input: { task: 'task', failure: 'validation' },
              saveAs: 'replan',
            },
          ],
        },
      ],
    };

    const result = await runtime.run(schema, { task: 'Implement A1' });

    expect(result.status).toBe('completed');
    expect(replan.calls[0]?.input).toEqual({
      task: 'Implement A1',
      failure: { status: 'failed', reason: 'TypeScript error' },
    });
    expect(repairWorker.calls[0]?.context.preset).toBe('repair');
    expect(result.trace.some((entry) => entry.node.id === 'validate' && entry.status === 'failed')).toBe(true);
    expect(result.trace.some((entry) => entry.node.id === 'repair-process' && entry.status === 'completed')).toBe(true);
  });
});

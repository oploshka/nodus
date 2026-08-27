import { resolve } from 'node:path';
import { AutomationLoader } from '@engine/Automation/AutomationLoader.js';
import { ProcessRuntime } from '@engine/Automation/ProcessRuntime.js';
import type {
  iProcessModule,
  sProcessExecutionContext,
  sProcessModuleResult,
} from '@engine/Automation/ProcessSchema.js';

class PrototypeWorker implements iProcessModule {
  public readonly id = 'worker';

  public async execute(
    input: Readonly<Record<string, unknown>>,
    context: sProcessExecutionContext,
  ): Promise<sProcessModuleResult> {
    return {
      status: 'completed',
      value: {
        task: input.task,
        preset: context.preset,
        changedPaths: context.preset === 'repair' ? ['src/repaired.ts'] : ['src/changed.ts'],
      },
    };
  }
}

class PrototypeValidate implements iProcessModule {
  public readonly id = 'validate';
  private attempts = 0;

  public constructor(private readonly failOnce: boolean) {}

  public async execute(input: Readonly<Record<string, unknown>>): Promise<sProcessModuleResult> {
    this.attempts += 1;
    if (this.failOnce && this.attempts === 1) {
      return {
        status: 'failed',
        reason: 'Prototype validation failure',
        value: { checked: input.changes },
      };
    }
    return {
      status: 'completed',
      value: { checked: input.changes, attempt: this.attempts },
    };
  }
}

class PrototypeReplan implements iProcessModule {
  public readonly id = 'replan';

  public async execute(input: Readonly<Record<string, unknown>>): Promise<sProcessModuleResult> {
    return {
      status: 'completed',
      value: { failure: input.failure },
      process: {
        kind: 'sequence',
        id: 'repair-process',
        variables: ['task', 'repair', 'validation'],
        input: { task: 'task' },
        output: { validation: 'validation' },
        steps: [
          {
            kind: 'action',
            id: 'repair',
            use: 'worker',
            preset: 'repair',
            input: { task: 'task' },
            saveAs: 'repair',
          },
          {
            kind: 'action',
            id: 'validate-repair',
            use: 'validate',
            input: { changes: 'repair.value' },
            saveAs: 'validation',
          },
        ],
      },
    };
  }
}

const failOnce = process.argv.includes('--fail-once');
const task = process.argv.filter((argument) => argument !== '--fail-once').slice(2).join(' ') || 'Prototype code change';
const automation = await AutomationLoader.load(resolve('automation'));
const schema = automation.schemas['code-change'];
if (!schema) throw new Error('automation schema code-change is not registered');

const runtime = new ProcessRuntime([
  new PrototypeWorker(),
  new PrototypeValidate(failOnce),
  new PrototypeReplan(),
]);

const result = await runtime.run(schema, { task });
console.log(JSON.stringify(result, null, 2));

import { resolve } from 'node:path';
import { AutomationLoader } from '@engine/Automation/AutomationLoader.js';
import { PlannerResolver } from '@engine/Automation/PlannerResolver.js';
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
  MODULE_RESULT,
  STEP,
  type iProcessModule,
  type sProcessExecutionContext,
  type sProcessOutput,
  type sProcessSchema,
  type tProcessExecutableStep,
  type tProcessModuleResult,
  type tProcessStep,
} from '@engine/Automation/ProcessSchema.js';

const TASK_TYPE = {
  SIMPLE: 'SIMPLE',
  MULTI: 'MULTI',
  PROCESS: 'PROCESS',
} as const;

type tTaskType = typeof TASK_TYPE[keyof typeof TASK_TYPE];

class PrototypePlanner implements iProcessPlanner {
  public constructor(private readonly type: tTaskType) {}

  public async qualify(_task: string): Promise<string> {
    return this.type;
  }

  public async plan(request: sProcessPlanningRequest): Promise<tProcessStep[]> {
    if (request.qualification === TASK_TYPE.SIMPLE) {
      return [
        {
          type: STEP.WORKER,
          task: request.task,
        },
      ];
    }

    return [
      {
        type: STEP.WORKER,
        task: 'Исследовать JSON как формат конфигурации: преимущества и недостатки.',
      },
      {
        type: STEP.WORKER,
        task: 'Исследовать YAML как формат конфигурации: преимущества и недостатки.',
      },
      {
        type: STEP.WORKER,
        task: 'Исследовать JavaScript как формат конфигурации: преимущества и недостатки.',
      },
      {
        type: STEP.WORKER,
        task: 'Сравнить варианты и выбрать один итоговый формат.',
        input: {
          context: {
            parent: true,
            steps: [1, 2, 3],
          },
        },
      },
    ];
  }

  public async replan(request: sProcessReplanningRequest): Promise<tProcessStep[]> {
    return [
      {
        type: STEP.WORKER,
        task: `Исправить проблему: ${request.failure.reason ?? 'неизвестная ошибка'}`,
        input: {
          context: {
            parent: true,
            previous: true,
          },
        },
      },
    ];
  }
}

class PrototypeWorker implements iProcessModule {
  public readonly type = STEP.WORKER;

  public async execute(
    step: tProcessExecutableStep,
    context: sProcessExecutionContext,
  ): Promise<tProcessModuleResult> {
    const selected = Object.entries(context.steps)
      .map(([number, output]) => `STEP ${number}: ${String(output.value)}`)
      .join('\n');

    const output: sProcessOutput = {
      status: 'SUCCESS',
      value: [
        step.task ?? String(context.parent ?? ''),
        selected,
      ].filter(Boolean).join('\n'),
    };

    return { type: MODULE_RESULT.OUTPUT, output };
  }
}

const type: tTaskType = process.argv.includes('--multi')
  ? TASK_TYPE.MULTI
  : process.argv.includes('--process')
    ? TASK_TYPE.PROCESS
    : TASK_TYPE.SIMPLE;
const task = process.argv
  .filter((argument) => argument !== '--multi' && argument !== '--process')
  .slice(2)
  .join(' ') || 'Выбрать подходящий формат конфигурации приложения.';

const automation = await AutomationLoader.load(resolve('automation'));
const plannerDefinition = automation.planners.task as { schema?: unknown };
const schema = plannerDefinition.schema;
if (!schema || typeof schema !== 'object' || (schema as { type?: unknown }).type !== STEP.SEQUENCE) {
  throw new Error('automation PlannerTask schema is not registered');
}

const resolver = new PlannerResolver();
const planner = resolver.resolve(task, [new PrototypePlanner(type)]);
const runtime = new ProcessRuntime([
  new QualifyProcessModule(planner),
  new PlanProcessModule(planner),
  new ReplanProcessModule(planner),
  new PrototypeWorker(),
]);

const result = await runtime.run(schema as sProcessSchema, task);
console.log(JSON.stringify(result, null, 2));

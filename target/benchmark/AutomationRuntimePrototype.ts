import { resolve } from 'node:path';
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
  type sProcessOutput,
  type tProcessExecutableStep,
  type tProcessStep,
} from '@engine/Automation/ProcessSchema.js';

class PrototypePlanner implements iProcessPlanner {
  public constructor(private readonly type: TASK_TYPE) {}

  public async qualify(_task: string): Promise<TASK_TYPE> {
    return this.type;
  }

  public async plan(request: sProcessPlanningRequest): Promise<tProcessStep[]> {
    if (request.type === TASK_TYPE.SIMPLE) {
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
  ): Promise<sProcessOutput> {
    const selected = Object.entries(context.steps)
      .map(([number, output]) => `STEP ${number}: ${String(output.value)}`)
      .join('\n');

    return {
      status: 'SUCCESS',
      value: [
        step.task ?? String(context.parent ?? ''),
        selected,
      ].filter(Boolean).join('\n'),
    };
  }
}

const type = process.argv.includes('--multi')
  ? TASK_TYPE.MULTI
  : process.argv.includes('--process')
    ? TASK_TYPE.PROCESS
    : TASK_TYPE.SIMPLE;
const task = process.argv
  .filter((argument) => argument !== '--multi' && argument !== '--process')
  .slice(2)
  .join(' ') || 'Выбрать подходящий формат конфигурации приложения.';

const automation = await AutomationLoader.load(resolve('automation'));
const schema = automation.schemas.planner;
if (!schema) throw new Error('automation schema planner is not registered');

const planner = new PrototypePlanner(type);
const runtime = new ProcessRuntime([
  new QualifyProcessModule(planner),
  new PlanProcessModule(planner),
  new ReplanProcessModule(planner),
  new PrototypeWorker(),
]);

const result = await runtime.run(schema, task);
console.log(JSON.stringify(result, null, 2));

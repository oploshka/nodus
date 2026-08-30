import { resolve } from 'node:path';
import { AutomationLoader } from '@engine/Automation/AutomationLoader.js';
import { PlannerResolver } from '@engine/Planner/PlannerResolver.js';
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
  sProcessOutput,
  sProcessSchema,
  tProcessStep,
} from '@engine/Process/ProcessTsType.js';
import { WorkerRunner } from '@engine/Worker/WorkerRunner.js';
import { WorkerSchema } from '@engine/Worker/WorkerSchema.js';
import type { sWorkerRequest, sWorkerSchema, tWorkerResult } from '@engine/Worker/WorkerTsType.js';

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

class PrototypeWorker extends WorkerRunner {
  public async run(request: sWorkerRequest): Promise<tWorkerResult> {
    const selected = request.context.steps
      .map((ref) => `STEP ${ref.number}: ${String(ref.output.value)}`)
      .join('\n');

    const output: sProcessOutput = {
      status: 'SUCCESS',
      value: [request.task, selected].filter(Boolean).join('\n'),
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

const workerDefinition = automation.workers.code as sWorkerSchema;
const resolver = new PlannerResolver();
const planner = resolver.resolve(task, [new PrototypePlanner(type)]);
const runtime = new ProcessRuntime([
  new QualifyProcessModule(planner),
  new PlanProcessModule(planner),
  new ReplanProcessModule(planner),
  new PrototypeWorker(new WorkerSchema(workerDefinition)),
]);

const result = await runtime.run(schema as sProcessSchema, task);
console.log(JSON.stringify(result, null, 2));

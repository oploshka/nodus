import type {
  iProcessModule,
  sProcessExecutionContext,
  sProcessModuleResult,
  sProcessSchema,
} from './ProcessSchema.js';

export interface sProcessPlanningRequest {
  task: string;
  mode: 'plan' | 'replan';
  failure?: unknown;
}

/** Planner owns task classification/decomposition and returns an executable schema. */
export interface iProcessPlanner {
  plan(request: sProcessPlanningRequest): Promise<sProcessSchema>;
}

/** Allows a task inside a process to recursively pass through Planner. */
export class PlannerProcessModule implements iProcessModule {
  public readonly id = 'planner';

  public constructor(private readonly planner: iProcessPlanner) {}

  public async execute(
    input: Readonly<Record<string, unknown>>,
    _context: sProcessExecutionContext,
  ): Promise<sProcessModuleResult> {
    const task = requireTask(input.task);
    const process = await this.planner.plan({ task, mode: 'plan' });
    return {
      status: 'completed',
      value: { schemaId: process.id },
      process,
    };
  }
}

/** Simple controlled recovery: ask Planner for a repair schema and execute it next. */
export class ReplanProcessModule implements iProcessModule {
  public readonly id = 'replan';

  public constructor(private readonly planner: iProcessPlanner) {}

  public async execute(
    input: Readonly<Record<string, unknown>>,
    _context: sProcessExecutionContext,
  ): Promise<sProcessModuleResult> {
    const task = requireTask(input.task);
    const process = await this.planner.plan({
      task,
      mode: 'replan',
      failure: input.failure,
    });
    return {
      status: 'completed',
      value: { schemaId: process.id },
      process,
    };
  }
}

function requireTask(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Planner process module requires a non-empty task string.');
  }
  return value;
}

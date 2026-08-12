import type { Logger } from '../app/logging/Logger.js';
import type { Planner } from './planner/Planner.js';
import type { Project } from './project/Project.js';
import { Task } from './task/Task.js';
import { TaskRun } from './task/TaskRun.js';
import type { DefaultWorker } from './worker/DefaultWorker.js';

/**
 * Coordinator only. It owns the run loop, but not planning/research/action logic.
 */
export class Engine {
  public constructor(
    private readonly project: Project,
    private readonly planner: Planner,
    private readonly worker: DefaultWorker,
    private readonly logger: Logger,
  ) {}

  public async runTask(description: string): Promise<TaskRun> {
    const task = new Task(description, this.project.id);
    this.logger.info('engine.task.start', { taskId: task.id, description });
    const plan = await this.planner.plan(task);
    const run = new TaskRun(task, plan);

    for (const step of plan.steps) {
      const result = await this.worker.execute(task, step);
      run.add(step.id, result);
      if (result.status === 'failed') break;
    }

    run.finish();
    this.logger.info('engine.task.finish', { taskId: task.id, status: run.status });
    return run;
  }
}

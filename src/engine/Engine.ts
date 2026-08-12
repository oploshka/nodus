import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { Planner } from '@engine/Planner/Planner.js';
import type { Project } from '@engine/Project/Project.js';
import { Task } from '@engine/Task/Task.js';
import { TaskRun } from '@engine/Task/TaskRun.js';
import type { Worker } from '@engine/Worker/Worker.js';
import type { WorkerSelector } from '@engine/Worker/WorkerSelector.js';

/** Coordinator only: plan -> route step -> run worker -> react to status. */
export class Engine {
  public constructor(
    private readonly project: Project,
    private readonly planner: Planner,
    private readonly workers: ReadonlyArray<Worker>,
    private readonly workerSelector: WorkerSelector,
    private readonly logger: EngineLogger,
  ) {}

  public async run(description: string): Promise<TaskRun> {
    const task = new Task(description, this.project.id);
    this.logger.info('engine.task.start', { taskId: task.id, description });

    const plan = await this.planner.plan(task);
    this.logger.info('engine.plan', { taskId: task.id, steps: plan.steps });

    const run = new TaskRun(task, plan);

    for (const step of plan.steps) {
      this.logger.info('engine.step.start', { taskId: task.id, step });

      const worker = await this.workerSelector.select(step, this.workers);
      this.logger.info('engine.worker.selected', { taskId: task.id, stepId: step.id, workerId: worker.id });

      const result = await worker.run(task, step);
      run.add(step.id, worker.id, result);
      this.logger.info('engine.step.finish', { taskId: task.id, stepId: step.id, workerId: worker.id, status: result.status });

      // Only a completed PlanStep advances the global plan. Other statuses are
      // intentionally preserved for the next orchestration/recovery iteration.
      if (result.status !== 'completed') break;
    }

    run.finish();
    this.logger.info('engine.task.finish', { taskId: task.id, status: run.status });
    return run;
  }
}

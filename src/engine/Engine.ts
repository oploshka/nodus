import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { Planner } from '@engine/Planner/Planner.js';
import type { Project } from '@engine/Project/Project.js';
import { Task } from '@engine/Task/Task.js';
import { TaskRun } from '@engine/Task/TaskRun.js';
import type { Worker } from '@engine/Worker/Worker.js';

/**
 * Coordinator only. It owns the run loop, but not planning/Research/action logic.
 */
export class Engine {
  public constructor(
    private readonly project: Project,
    private readonly planner: Planner,
    private readonly workers: ReadonlyArray<Worker>,
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
      const worker = this.selectWorker(step);
      this.logger.info('engine.worker.selected', { taskId: task.id, stepId: step.id, workerId: worker.id });
      const result = await worker.run(task, step);
      run.add(step.id, result);
      this.logger.info('engine.step.finish', { taskId: task.id, stepId: step.id, status: result.status });
      if (result.status === 'failed') break;
    }

    run.finish();
    this.logger.info('engine.task.finish', { taskId: task.id, status: run.status });
    return run;
  }

  /** Temporary deterministic router. A richer routing decision can replace this
   * without changing the Worker contract or the run loop. */
  private selectWorker(step: Parameters<Worker['canHandle']>[0]): Worker {
    const worker = this.workers.find((candidate) => candidate.canHandle(step));
    if (!worker) throw new Error(`No worker can handle plan step: ${step.id}`);
    return worker;
  }
}


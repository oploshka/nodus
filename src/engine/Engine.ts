import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { Planner } from '@engine/Planner/Planner.js';
import type { Project } from '@engine/Project/Project.js';
import { Task } from '@engine/Task/Task.js';
import { TaskRun } from '@engine/Task/TaskRun.js';
import type { Worker } from '@engine/Worker/Worker.js';
import type { Determine } from '@engine/Determine/Determine.js';
import { EnginePresentation } from '@engine/Presentation/EnginePresentation.js';
import type { ProjectEditor } from '@engine/Edit/ProjectEditor.js';
import type { Validator } from '@engine/Validation/Validator.js';

/** Coordinator: plan -> route -> worker -> edit -> validate -> advance or stop. */
export class Engine {
  public readonly presentation = new EnginePresentation();
  public constructor(
    private readonly project: Project,
    private readonly planner: Planner,
    private readonly workers: ReadonlyArray<Worker>,
    private readonly determine: Determine,
    private readonly editor: ProjectEditor,
    private readonly validator: Validator,
    private readonly logger: EngineLogger,
  ) {}

  public async run(description: string): Promise<TaskRun> {
    const task = new Task(description, this.project.id);
    this.logger.info('engine.task.start', { taskId: task.id, description, presentation: this.presentation });

    this.logger.info('planner.plan.start', { taskId: task.id, presentation: this.planner.presentation });
    const plan = await this.planner.plan(task);
    this.logger.info('engine.plan', { taskId: task.id, steps: plan.steps, presentation: this.planner.presentation });

    const run = new TaskRun(task, plan);
    this.logger.info('engine.execution.start', { taskId: task.id, presentation: this.presentation });

    for (const step of plan.steps) {
      this.logger.info('engine.step.start', { taskId: task.id, step, presentation: this.presentation });

      const availableWorkers = this.workers.filter((worker) => worker.canHandle(step));
      this.logger.info('determine.start', { taskId: task.id, stepId: step.id, options: availableWorkers.length, presentation: this.determine.presentation });
      const worker = await this.determine.option({
        goal: step.goal,
        options: availableWorkers.map((worker) => ({
          id: worker.id,
          description: worker.description,
          value: worker,
        })),
      });
      this.logger.info('determine.finish', { taskId: task.id, stepId: step.id, optionId: worker.id, workerName: worker.name, workerPresentation: worker.presentation, presentation: this.determine.presentation });
      this.logger.info('engine.worker.selected', { taskId: task.id, stepId: step.id, workerId: worker.id, workerName: worker.name, workerPresentation: worker.presentation });

      const startedAt = performance.now();
      let changedPaths: string[] = [];
      let result = await worker.run(task, step);
      if (result.status === 'completed' && result.edit) {
        const summary = result.summary;
        const editResult = await this.editor.apply(task, step, result.edit);
        if (editResult.status === 'completed') {
          changedPaths = editResult.paths;
          result = { status: 'completed', summary };
        } else {
          result = { status: 'not-completed', reason: editResult.reason, canContinue: true };
        }
      }
      if (result.status === 'completed') {
        this.logger.info('validation.start', { taskId: task.id, stepId: step.id, changedPaths, presentation: this.validator.presentation });
        const validation = await this.validator.validate({ task, step, result, changedPaths });
        if (validation.status === 'passed') {
          this.logger.info('validation.passed', {
            taskId: task.id,
            stepId: step.id,
            checks: validation.checks,
            presentation: this.validator.presentation,
          });
        } else {
          this.logger.warn('validation.failed', {
            taskId: task.id,
            stepId: step.id,
            reason: validation.reason,
            checks: validation.checks,
            presentation: this.validator.presentation,
          });
          result = { status: 'not-completed', reason: validation.reason, canContinue: true };
        }
      }
      const durationMs = performance.now() - startedAt;
      run.add(step.id, worker.id, result);
      this.logger.info('engine.step.finish', { taskId: task.id, stepId: step.id, workerId: worker.id, status: result.status, presentation: this.presentation });
      this.logger.info('engine.execution.sample', {
        task: { id: task.id, description: task.description },
        step: { id: step.id, goal: step.goal, constraints: step.constraints },
        candidates: availableWorkers.map((candidate) => candidate.id),
        worker: { id: worker.id, description: worker.description },
        result,
        durationMs,
      });

      // Only a completed PlanStep advances the global plan. Other statuses are
      // intentionally preserved for the next orchestration/recovery iteration.
      if (result.status !== 'completed') break;
    }

    run.finish();
    const lastResult = run.steps.at(-1)?.result;
    this.logger.info('engine.task.finish', {
      taskId: task.id,
      status: run.status,
      reason: lastResult && lastResult.status !== 'completed' ? lastResult.reason : undefined,
      canContinue: lastResult?.status === 'not-completed' ? lastResult.canContinue : false,
      presentation: this.presentation,
    });
    return run;
  }
}

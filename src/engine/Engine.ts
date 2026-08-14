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

export type EditFactory = () => ProjectEditor;

/** Coordinator: plan -> route -> worker -> accumulated Edit -> apply -> validate. */
export class Engine {
  public readonly presentation = new EnginePresentation();
  private readonly pendingEdits = new Map<string, ProjectEditor>();

  public constructor(
    private readonly project: Project,
    private readonly planner: Planner,
    private readonly workers: ReadonlyArray<Worker>,
    private readonly determine: Determine,
    private readonly createEdit: EditFactory,
    private readonly validator: Validator,
    private readonly logger: EngineLogger,
  ) {}

  public async run(description: string): Promise<TaskRun> {
    const task = new Task(description, this.project.id);
    const edit = this.createEdit();
    this.logger.info('engine.task.start', { taskId: task.id, description, presentation: this.presentation });

    this.logger.info('planner.plan.start', { taskId: task.id, presentation: this.planner.presentation });
    const plan = await this.planner.plan(task);
    this.logger.info('engine.plan', { taskId: task.id, steps: plan.steps, presentation: this.planner.presentation });

    const run = new TaskRun(task, plan);
    this.logger.info('engine.execution.start', { taskId: task.id, presentation: this.presentation });

    for (let index = 0; index < plan.steps.length; index += 1) {
      const step = plan.steps[index];
      const isLastStep = index === plan.steps.length - 1;
      const checkpoint = edit.state();
      this.logger.info('engine.step.start', { taskId: task.id, step, presentation: this.presentation });

      const availableWorkers = this.workers.filter((worker) => worker.canHandle(step));
      this.logger.info('determine.start', { taskId: task.id, stepId: step.id, options: availableWorkers.length, presentation: this.determine.presentation });
      const worker = await this.determine.option({
        goal: step.goal,
        options: availableWorkers.map((candidate) => ({
          id: candidate.id,
          description: candidate.description,
          value: candidate,
        })),
      });
      this.logger.info('determine.finish', { taskId: task.id, stepId: step.id, optionId: worker.id, workerName: worker.name, workerPresentation: worker.presentation, presentation: this.determine.presentation });
      this.logger.info('engine.worker.selected', { taskId: task.id, stepId: step.id, workerId: worker.id, workerName: worker.name, workerPresentation: worker.presentation });

      const startedAt = performance.now();
      let result = await worker.run(task, step, edit);
      let changedPaths: string[] = [];

      if (result.status !== 'completed') {
        edit.restore(checkpoint);
        this.pendingEdits.set(task.id, edit);
      } else if (isLastStep) {
        const applied = await edit.apply();
        if (applied.status === 'not-completed') {
          result = { status: 'not-completed', reason: applied.reason, canContinue: true };
          this.pendingEdits.set(task.id, edit);
        } else {
          changedPaths = applied.paths;
          this.pendingEdits.delete(task.id);

          // Validation ownership is intentionally temporary here. It will be redistributed
          // after the accumulated Edit mechanics have settled.
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

      if (result.status !== 'completed') break;
    }

    run.finish();
    const lastResult = run.steps.at(-1)?.result;
    this.logger.info('engine.task.finish', {
      taskId: task.id,
      status: run.status,
      reason: lastResult && lastResult.status !== 'completed' ? lastResult.reason : undefined,
      canContinue: lastResult?.status === 'not-completed' ? lastResult.canContinue : false,
      hasPendingEdit: this.pendingEdits.has(task.id),
      presentation: this.presentation,
    });
    return run;
  }
}

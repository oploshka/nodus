// PlanGenerator.ts
import { PlanCompiler } from '@planner/PlanCompiler';
import type { RequirementMap } from '@planner/RequirementMap';
import { RequirementPlanner } from '@planner/RequirementPlanner';
import type { PlanStepType, TaskPlan } from '@planner/TaskPlan';
import type { StepRegistry } from '@planner/StepRegistry';
import type { ModelConfiguration } from '@core/Configuration/Configuration';
import type { Logger } from '@core/Logging/Logger';
import type { Task } from '@core/Task/Task';
import type { ModelAdapter } from '@model/Adapter/ModelAdapter';
import type { ProjectSession } from '@project/ProjectSession/ProjectSession';

export class PlanGenerator {
  private readonly requirementPlanner: RequirementPlanner;
  private readonly compiler: PlanCompiler;

  public constructor(
    configuration: ModelConfiguration,
    adapter: ModelAdapter,
    projectSession: ProjectSession,
    private readonly logger: Logger,
    private readonly stepRegistry: StepRegistry,
  ) {
    this.requirementPlanner = new RequirementPlanner(configuration, adapter, projectSession, logger);
    this.compiler = new PlanCompiler(stepRegistry);
  }

  public async generate(task: Task, executionId: string): Promise<TaskPlan> {
    const language = this.resolveLanguage(task.description);
    try {
      const requirements = await this.requirementPlanner.generate(task, executionId);
      const plan = this.compiler.compile(requirements, language);
      await this.logPlan(task, executionId, plan, 'requirement-map');
      return plan;
    } catch (error) {
      const fallback = this.fallback(task.description, language);
      await this.logger.warn('task-plan-generation-failed', { error: String(error), fallback }, {
        projectId: task.projectId,
        conversationId: task.conversationId,
        taskId: task.id,
        executionId,
      });
      return fallback;
    }
  }

  public compile(requirements: RequirementMap, description: string): TaskPlan {
    return this.compiler.compile(requirements, this.resolveLanguage(description));
  }

  private async logPlan(task: Task, executionId: string, plan: TaskPlan, source: string): Promise<void> {
    await this.logger.info('task-plan-created', { goal: plan.goal, steps: plan.steps, source }, {
      projectId: task.projectId,
      conversationId: task.conversationId,
      taskId: task.id,
      executionId,
    });
  }

  private fallback(description: string, language: 'ru' | 'en'): TaskPlan {
    const normalized = description.toLowerCase();
    const write = ['добав', 'измени', 'измен', 'исправ', 'удали', 'создай', 'рефактор', 'реализ', 'add ', 'change ', 'modify ', 'fix ', 'delete ', 'create ', 'implement ', 'refactor ']
      .some((signal) => normalized.includes(signal));
    const types: PlanStepType[] = write
      ? ['search', 'understand', 'prepare-change', 'edit-file', 'review', 'finalize']
      : ['search', 'understand', 'finalize'];

    return {
      version: 3,
      goal: description,
      steps: types.map((type, index) => {
        const action = this.stepRegistry.defaultAction(type);
        const subject = description;
        return {
          id: `step-${index + 1}`,
          type,
          action,
          subject,
          goal: this.stepRegistry.renderGoal(type, action, subject, language),
          status: 'pending',
          maxAttempts: this.stepRegistry.limit(type),
          inputs: index === 0 ? [] : [`step-${index}.result`],
          outputs: [`step-${index + 1}.result`],
        };
      }),
    };
  }

  private resolveLanguage(description: string): 'ru' | 'en' {
    const cyrillic = (description.match(/[А-Яа-яЁё]/g) ?? []).length;
    const latin = (description.match(/[A-Za-z]/g) ?? []).length;
    return cyrillic > latin ? 'ru' : 'en';
  }
}

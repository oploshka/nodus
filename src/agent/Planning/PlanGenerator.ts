import type { ModelConfiguration } from '@core/Configuration/Configuration';
import type { Logger } from '@core/Logging/Logger';
import type { Task } from '@core/Task/Task';
import type { ModelAdapter } from '@model/Adapter/ModelAdapter';
import type { PromptRegistry } from '@model/Profile/PromptRegistry';
import type { ModelRequest } from '@model/Request/ModelRequest';
import type { ProjectSession } from '@project/ProjectSession/ProjectSession';
import type { PlanStepType, TaskPlan } from '@agent/Planning/TaskPlan';
import type { StepRegistry } from '@agent/Planning/StepRegistry';

export class PlanGenerator {
  public constructor(
    private readonly configuration: ModelConfiguration,
    private readonly adapter: ModelAdapter,
    private readonly promptRegistry: PromptRegistry,
    private readonly projectSession: ProjectSession,
    private readonly logger: Logger,
    private readonly stepRegistry: StepRegistry,
  ) {}

  public async generate(task: Task, executionId: string): Promise<TaskPlan> {
    const prompt = this.promptRegistry.get('task-plan');
    const request: ModelRequest = {
      model: this.configuration.model,
      temperature: 0,
      maxTokens: Math.min(this.configuration.maxTokens ?? 1024, 1024),
      messages: [
        {
          role: 'system',
          content: `${prompt.systemPrompt}\n\nPurpose: ${prompt.purpose}\n\nInstructions:\n${prompt.instructions.map((value) => `- ${value}`).join('\n')}\n\n${this.protocol()}`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: task.description,
            taskContext: task.context,
            project: {
              id: this.projectSession.projectId,
              files: this.projectSession.index?.files.map((file) => file.path) ?? [],
            },
            availableStepTypes: this.stepRegistry.listForPlanner().map((definition) => ({
              type: definition.type,
              description: definition.description,
              maxAttempts: definition.maxAttempts,
            })),
          }, null, 2),
        },
      ],
    };

    try {
      const response = await this.adapter.complete(request);
      const plan = this.parse(response.content);
      await this.logger.info('task-plan-created', { goal: plan.goal, steps: plan.steps }, {
        projectId: task.projectId,
        conversationId: task.conversationId,
        taskId: task.id,
        executionId,
      });
      return plan;
    } catch (error) {
      const fallback = this.fallback(task.description);
      await this.logger.warn('task-plan-generation-failed', { error: String(error), fallback }, {
        projectId: task.projectId,
        conversationId: task.conversationId,
        taskId: task.id,
        executionId,
      });
      return fallback;
    }
  }

  private parse(content: string): TaskPlan {
    const raw = this.extractJson(content);
    const parsed = JSON.parse(raw) as { goal?: unknown; steps?: Array<{ id?: unknown; type?: unknown; goal?: unknown; maxAttempts?: unknown }> };
    if (typeof parsed.goal !== 'string' || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      throw new Error('Planner returned an invalid TaskPlan');
    }

    const steps = parsed.steps.slice(0, 8).map((step, index) => {
      if (typeof step.type !== 'string' || !this.stepRegistry.has(step.type)) {
        throw new Error(`Planner returned unsupported step type: ${String(step.type)}`);
      }
      const type = step.type as PlanStepType;
      const maxLimit = this.stepRegistry.limit(type);
      const requestedLimit = typeof step.maxAttempts === 'number' ? Math.floor(step.maxAttempts) : maxLimit;
      return {
        id: typeof step.id === 'string' && step.id.trim() ? step.id : `step-${index + 1}`,
        type,
        goal: typeof step.goal === 'string' && step.goal.trim() ? step.goal.trim() : type,
        status: 'pending' as const,
        maxAttempts: Math.max(1, Math.min(requestedLimit, maxLimit)),
      };
    });

    if (steps[steps.length - 1]?.type !== 'finalize') {
      steps.push({ id: `step-${steps.length + 1}`, type: 'finalize', goal: 'Prepare the final user-facing result.', status: 'pending', maxAttempts: this.stepRegistry.limit('finalize') });
    }
    return { goal: parsed.goal.trim(), steps };
  }

  private fallback(description: string): TaskPlan {
    const normalized = description.toLowerCase();
    const write = ['добав', 'измени', 'измен', 'исправ', 'удали', 'создай', 'рефактор', 'реализ', 'add ', 'change ', 'modify ', 'fix ', 'delete ', 'create ', 'implement ', 'refactor ']
      .some((signal) => normalized.includes(signal));
    const types: PlanStepType[] = write
      ? ['search', 'understand', 'prepare-change', 'edit-file', 'review', 'finalize']
      : ['search', 'understand', 'finalize'];
    return {
      goal: description,
      steps: types.map((type, index) => ({ id: `step-${index + 1}`, type, goal: type, status: 'pending', maxAttempts: this.stepRegistry.limit(type) })),
    };
  }

  private extractJson(content: string): string {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return fenced[1].trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
    throw new Error('Planner response does not contain JSON');
  }

  private protocol(): string {
    const types = this.stepRegistry.listForPlanner().map((definition) => definition.type).join(' | ');
    return `Return ONLY JSON:\n{\n  "goal": "short task goal",\n  "steps": [{ "id": "step-1", "type": "${types}", "goal": "one concrete verifiable goal", "maxAttempts": 1 }]\n}`;
  }
}

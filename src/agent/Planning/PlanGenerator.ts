// PlanGenerator.ts
import type { ModelConfiguration } from '@core/Configuration/Configuration';
import type { Logger } from '@core/Logging/Logger';
import type { Task } from '@core/Task/Task';
import type { ModelAdapter } from '@model/Adapter/ModelAdapter';
import type { ModelCallProfile } from '@model/Profile/ModelCallProfile';
import { composePrompt } from '@model/Prompt/PromptComposer';
import { taskMessage, userMessage } from '@model/Prompt/ModelInputComposer';
import type { ModelRequest } from '@model/Request/ModelRequest';
import { transportMessages } from '@model/Request/ModelMessageTransport';
import type { ProjectSession } from '@project/ProjectSession/ProjectSession';
import type { PlanStepAction, PlanStepType, TaskPlan } from '@agent/Planning/TaskPlan';
import type { StepRegistry } from '@agent/Planning/StepRegistry';

const TASK_PLAN_PROFILE: ModelCallProfile = {
  prompt: {
    purpose: 'Create a compact executable plan by selecting only declared step types and actions.',
    rules: [
      'Plan the whole task using the smallest useful number of steps.',
      'Combine related retrieval needs into one search step when they can reasonably be found in the same project area or tool round.',
      'For every step choose exactly one allowed action for that step type and give it one concrete subject.',
      'Treat type + action + subject as the semantic contract of the step. Do not invent a broader free-form operation.',
      'Use the supplied project index only as orientation. Do not invent files, directories, APIs, or service layers.',
      'Search actions only locate concrete project evidence. Use understand actions only when located evidence must be interpreted before a safe change can be defined.',
      'Choose find-definitions when the task asks where a value comes from, where it is stored/declared, or how a value is exposed by a named class/file. Choose find-usages only for actual call sites/occurrences of an already known symbol. Choose find-examples for an existing implementation pattern.',
      'Do not turn a semantic value name such as conversation ID into an assumed code identifier such as conversationId unless that exact identifier was supplied by project evidence.',
      'Use prepare-change before edit-file when code must change. End every plan with finalize. Add review or verify only when they add concrete value.',
      'Inputs may reference only outputs of earlier steps. Use short stable dot-separated output keys.',
      'Respect the supplied maximum attempt limits.',
    ],
  },
  model: { temperature: 0, maxTokens: 1024 },
};

interface RawPlanStep {
  id?: unknown;
  type?: unknown;
  action?: unknown;
  subject?: unknown;
  maxAttempts?: unknown;
  inputs?: unknown;
  outputs?: unknown;
}

export class PlanGenerator {
  public constructor(
    private readonly configuration: ModelConfiguration,
    private readonly adapter: ModelAdapter,
    private readonly projectSession: ProjectSession,
    private readonly logger: Logger,
    private readonly stepRegistry: StepRegistry,
  ) {}

  public async generate(task: Task, executionId: string): Promise<TaskPlan> {
    const language = this.resolveLanguage(task.description);
    const request: ModelRequest = {
      model: this.configuration.model,
      temperature: TASK_PLAN_PROFILE.model.temperature ?? this.configuration.temperature,
      maxTokens: Math.min(this.configuration.maxTokens ?? 1024, TASK_PLAN_PROFILE.model.maxTokens ?? 1024),
      messages: transportMessages([
        {
          role: 'system',
          content: composePrompt(TASK_PLAN_PROFILE.prompt, { returnFormat: this.protocol() }),
        },
        taskMessage(task.description, task.context),
        userMessage('Project candidates:', [
          `Project ID: ${this.projectSession.projectId}`,
          ...this.plannerCandidateFiles(task.description).map((file) => `- ${file}`),
        ].join('\n')),
        userMessage('Attempt limits:', this.stepRegistry.listForPlanner()
          .map((definition) => `- ${definition.type}: ${definition.maxAttempts}`)
          .join('\n')),
      ], this.configuration.messageLayout),
    };

    try {
      const response = await this.adapter.complete(request);
      const plan = this.parse(response.content, language);
      await this.logger.info('task-plan-created', { goal: plan.goal, steps: plan.steps }, {
        projectId: task.projectId,
        conversationId: task.conversationId,
        taskId: task.id,
        executionId,
      });
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

  private parse(content: string, language: 'ru' | 'en'): TaskPlan {
    const raw = this.extractJson(content);
    const parsed = JSON.parse(raw) as { goal?: unknown; steps?: RawPlanStep[] };
    if (typeof parsed.goal !== 'string' || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      throw new Error('Planner returned an invalid TaskPlan');
    }

    const knownOutputs = new Set<string>();
    const steps = parsed.steps.slice(0, 8).map((step, index) => {
      if (typeof step.type !== 'string' || !this.stepRegistry.has(step.type)) {
        throw new Error(`Planner returned unsupported step type: ${String(step.type)}`);
      }
      const type = step.type as PlanStepType;
      const subject = this.subject(step.subject, type);
      const action = this.stepRegistry.normalizeAction(type, this.action(type, step.action), subject);
      const maxLimit = this.stepRegistry.limit(type);
      const requestedLimit = typeof step.maxAttempts === 'number' ? Math.floor(step.maxAttempts) : maxLimit;
      const id = typeof step.id === 'string' && step.id.trim() ? step.id : `step-${index + 1}`;
      const declaredOutputs = this.factKeys(step.outputs);
      const outputs = (declaredOutputs.length > 0 ? declaredOutputs : [`${id}.result`]).filter((key) => !knownOutputs.has(key));
      const inputs = this.factKeys(step.inputs).filter((key) => knownOutputs.has(key));
      for (const output of outputs) knownOutputs.add(output);
      return {
        id,
        type,
        action,
        subject,
        goal: this.stepRegistry.renderGoal(type, action, subject, language),
        status: 'pending' as const,
        maxAttempts: Math.max(1, Math.min(requestedLimit, maxLimit)),
        inputs,
        outputs,
      };
    });

    if (steps[steps.length - 1]?.type !== 'finalize') {
      const type: PlanStepType = 'finalize';
      const action = this.stepRegistry.defaultAction(type);
      const subject = language === 'ru' ? 'выполненную задачу' : 'the completed task';
      steps.push({
        id: `step-${steps.length + 1}`,
        type,
        action,
        subject,
        goal: this.stepRegistry.renderGoal(type, action, subject, language),
        status: 'pending',
        maxAttempts: this.stepRegistry.limit(type),
        inputs: Array.from(knownOutputs),
        outputs: ['task.final-result'],
      });
    }
    return { version: 2, goal: parsed.goal.trim(), steps };
  }

  private fallback(description: string, language: 'ru' | 'en'): TaskPlan {
    const normalized = description.toLowerCase();
    const write = ['добав', 'измени', 'измен', 'исправ', 'удали', 'создай', 'рефактор', 'реализ', 'add ', 'change ', 'modify ', 'fix ', 'delete ', 'create ', 'implement ', 'refactor ']
      .some((signal) => normalized.includes(signal));
    const types: PlanStepType[] = write
      ? ['search', 'understand', 'prepare-change', 'edit-file', 'review', 'finalize']
      : ['search', 'understand', 'finalize'];
    return {
      version: 2,
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

  private action(type: PlanStepType, value: unknown): PlanStepAction {
    if (typeof value === 'string' && this.stepRegistry.hasAction(type, value)) return value;
    return this.stepRegistry.defaultAction(type);
  }

  private subject(value: unknown, type: PlanStepType): string {
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 240);
    return this.stepRegistry.get(type).description;
  }

  private factKeys(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map(String)
      .map((item) => item.trim())
      .filter((item) => /^[a-z0-9][a-z0-9._-]{1,79}$/i.test(item))
      .slice(0, 8);
  }

  private plannerCandidateFiles(description: string): string[] {
    const files = this.projectSession.index?.files.map((file) => file.path) ?? [];
    if (files.length <= 16) return files;

    const lower = description.toLowerCase();
    const expanded = new Set(
      lower.replace(/[^a-zа-яё0-9._/-]+/gi, ' ')
        .split(/\s+/)
        .map((token) => token.replace(/^\/+|\/+$/g, ''))
        .filter((token) => token.length >= 3),
    );
    if (lower.includes('cli') || lower.includes('команд')) for (const token of ['cli', 'command']) expanded.add(token);
    if (lower.includes('project') || lower.includes('проект')) for (const token of ['project', 'configuration', 'nodus']) expanded.add(token);
    if (lower.includes('conversation') || lower.includes('диалог')) expanded.add('conversation');
    if (lower.includes('index') || lower.includes('индекс')) for (const token of ['index', 'projectsession']) expanded.add(token);
    if (lower.includes('status')) for (const token of ['cli', 'projectsession', 'conversation', 'index']) expanded.add(token);

    const ranked = files.map((path) => {
      const normalized = path.toLowerCase();
      let score = 0;
      for (const token of expanded) if (normalized.includes(token)) score += token.length >= 6 ? 3 : 2;
      if (normalized.includes('/test/') || normalized.includes('benchmark') || normalized.includes('/doc/')) score -= 4;
      return { path, score };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

    const selected = ranked.slice(0, 16).map((item) => item.path);
    return selected.length > 0 ? selected : files.slice(0, 16);
  }

  private resolveLanguage(description: string): 'ru' | 'en' {
    const cyrillic = (description.match(/[А-Яа-яЁё]/g) ?? []).length;
    const latin = (description.match(/[A-Za-z]/g) ?? []).length;
    return cyrillic > latin ? 'ru' : 'en';
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
    const actions = this.stepRegistry.listForPlanner()
      .map((definition) => `${definition.type}: ${definition.actions.map((action) => action.id).join(' | ')}`)
      .join('\n');
    return `Choose only from this whitelist:\n${actions}\n\nReturn ONLY JSON:\n{\n  "goal": "short task goal",\n  "steps": [{ "id": "step-1", "type": "allowed type", "action": "allowed action for that type", "subject": "one concrete subject", "maxAttempts": 1, "inputs": ["fact.key"], "outputs": ["fact.key"] }]\n}\nDo not write a free-form per-step goal. Nodus derives it from type + action + subject.`;
  }
}

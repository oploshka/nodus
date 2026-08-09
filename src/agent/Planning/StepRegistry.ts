// StepRegistry.ts
import type { PlanStepAction, PlanStepType } from '@agent/Planning/TaskPlan';

export interface StepActionDefinition {
  id: PlanStepAction;
  description: string;
  goalPrefix: {
    ru: string;
    en: string;
  };
}

export interface StepDefinition {
  type: PlanStepType;
  description: string;
  maxAttempts: number;
  initialPlanAllowed: boolean;
  actions: StepActionDefinition[];
}

const DEFINITIONS: StepDefinition[] = [
  {
    type: 'search',
    description: 'Locate concrete project evidence.',
    maxAttempts: 3,
    initialPlanAllowed: true,
    actions: [
      { id: 'find-files', description: 'Find files related to the subject.', goalPrefix: { ru: 'Найти файлы', en: 'Find files' } },
      { id: 'find-symbols', description: 'Find concrete symbols related to the subject.', goalPrefix: { ru: 'Найти символы', en: 'Find symbols' } },
      { id: 'find-definitions', description: 'Find definitions of the subject.', goalPrefix: { ru: 'Найти определения', en: 'Find definitions' } },
      { id: 'find-usages', description: 'Find usages of the subject.', goalPrefix: { ru: 'Найти использования', en: 'Find usages' } },
      { id: 'find-references', description: 'Find references or occurrences related to the subject.', goalPrefix: { ru: 'Найти ссылки и вхождения', en: 'Find references and occurrences' } },
      { id: 'find-examples', description: 'Find an existing project example of the subject.', goalPrefix: { ru: 'Найти существующий пример', en: 'Find an existing example' } },
    ],
  },
  {
    type: 'understand',
    description: 'Interpret already located evidence.',
    maxAttempts: 2,
    initialPlanAllowed: true,
    actions: [
      { id: 'explain-relationship', description: 'Explain how located elements relate to each other.', goalPrefix: { ru: 'Объяснить связь', en: 'Explain the relationship' } },
      { id: 'trace-data-flow', description: 'Trace how data moves through located code.', goalPrefix: { ru: 'Проследить поток данных', en: 'Trace the data flow' } },
      { id: 'identify-source', description: 'Identify the source of a value or behavior from located evidence.', goalPrefix: { ru: 'Определить источник', en: 'Identify the source' } },
      { id: 'identify-pattern', description: 'Identify the existing implementation pattern from located examples.', goalPrefix: { ru: 'Определить существующий паттерн', en: 'Identify the existing pattern' } },
      { id: 'determine-integration', description: 'Determine how located elements should integrate for the task.', goalPrefix: { ru: 'Определить интеграцию', en: 'Determine the integration' } },
    ],
  },
  {
    type: 'prepare-change',
    description: 'Turn established facts into a concrete change plan.',
    maxAttempts: 1,
    initialPlanAllowed: true,
    actions: [
      { id: 'define-change', description: 'Define the exact intended changes.', goalPrefix: { ru: 'Определить точное изменение', en: 'Define the exact change' } },
      { id: 'select-targets', description: 'Select the exact files that must change.', goalPrefix: { ru: 'Определить изменяемые файлы', en: 'Select target files' } },
    ],
  },
  {
    type: 'edit-file',
    description: 'Apply a prepared change to one concrete file.',
    maxAttempts: 3,
    initialPlanAllowed: true,
    actions: [
      { id: 'apply-change', description: 'Apply the prepared change to the target file.', goalPrefix: { ru: 'Применить изменение', en: 'Apply the change' } },
    ],
  },
  {
    type: 'review',
    description: 'Review the applied change.',
    maxAttempts: 1,
    initialPlanAllowed: true,
    actions: [
      { id: 'review-change', description: 'Review correctness, scope, and consistency.', goalPrefix: { ru: 'Проверить изменение', en: 'Review the change' } },
    ],
  },
  {
    type: 'verify',
    description: 'Run deterministic checks.',
    maxAttempts: 1,
    initialPlanAllowed: true,
    actions: [
      { id: 'run-checks', description: 'Run focused deterministic checks.', goalPrefix: { ru: 'Запустить проверки', en: 'Run checks' } },
    ],
  },
  {
    type: 'finalize',
    description: 'Produce the user-facing result.',
    maxAttempts: 1,
    initialPlanAllowed: true,
    actions: [
      { id: 'summarize-result', description: 'Summarize the completed task for the user.', goalPrefix: { ru: 'Сообщить результат', en: 'Summarize the result' } },
    ],
  },
];

export class StepRegistry {
  private readonly definitions = new Map<PlanStepType, StepDefinition>(DEFINITIONS.map((definition) => [definition.type, definition]));

  public get(type: PlanStepType): StepDefinition {
    const definition = this.definitions.get(type);
    if (!definition) throw new Error(`Unknown plan step type: ${type}`);
    return definition;
  }

  public has(value: string): value is PlanStepType {
    return this.definitions.has(value as PlanStepType);
  }

  public hasAction(type: PlanStepType, value: string): value is PlanStepAction {
    return this.get(type).actions.some((action) => action.id === value);
  }

  public defaultAction(type: PlanStepType): PlanStepAction {
    const action = this.get(type).actions[0];
    if (!action) throw new Error(`No actions configured for plan step type: ${type}`);
    return action.id;
  }

  public renderGoal(type: PlanStepType, actionId: PlanStepAction, subject: string, language: 'ru' | 'en'): string {
    const action = this.get(type).actions.find((candidate) => candidate.id === actionId);
    if (!action) throw new Error(`Unsupported action ${actionId} for plan step type ${type}`);
    const normalizedSubject = subject.trim() || this.get(type).description;
    return `${action.goalPrefix[language]}: ${normalizedSubject}`;
  }

  public listForPlanner(): StepDefinition[] {
    return Array.from(this.definitions.values()).filter((definition) => definition.initialPlanAllowed);
  }

  public limit(type: PlanStepType): number {
    return this.get(type).maxAttempts;
  }
}

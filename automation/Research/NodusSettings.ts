import type { EditStrategyId } from '@engine/Edit/EditTypes.js';

export interface PlannerProcessAdaptation {
  /** Шаблон сообщения Planner. Маркер ##message## заменяется исходным сообщением Process. */
  template: string;
}

export interface ChangeProcessAdaptation {
  /** Шаблон сообщения Change Action. Маркер ##message## заменяется исходным сообщением Process. */
  template: string;
  /** Поведенческие подсказки для решения, когда Worker уже должен действовать, а когда действительно нужен Research. */
  guidance: ReadonlyArray<string>;
}

export interface ChangeWorkerProfile {
  /** Коротко объясняет модели назначение конкретного Worker. */
  purpose: string;
  /** Дополнительные ограничения конкретного Worker поверх общей адаптации Change. */
  guidance: string;
  strategy: EditStrategyId;
}

export interface ResearchProcessAdaptation {
  /** Правила, по которым Research должен отвечать на один конкретный пробел в знаниях о проекте. */
  guidance: ReadonlyArray<string>;
}

export interface ProcessAdaptation {
  planner: PlannerProcessAdaptation;
  worker: {
    change: ChangeProcessAdaptation;
    research: ResearchProcessAdaptation;
    profiles: {
      code: ChangeWorkerProfile;
      documentation: ChangeWorkerProfile;
    };
  };
}

/**
 * Настройки поведения самого Nodus. Они не описывают конкретный target-проект:
 * project-level configuration позже сможет только переопределять отдельные части этих настроек.
 */
export interface NodusSettings {
  process: ProcessAdaptation;
}

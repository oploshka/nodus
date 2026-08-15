import type { NodusSettings } from './NodusSettings.js';

/**
 * Встроенные настройки Nodus. Пока они являются частью runtime-кода; позже этот объект
 * может стать основой для внешнего nodus.settings.ts/json и model-specific профилей.
 */
export const defaultNodusSettings: NodusSettings = {
  process: {
    planner: {
      template: [
        // Строй минимальное количество достаточно крупных смысловых шагов, которые Worker способен выполнить как одно связное изменение.
        'Create the smallest number of coherent semantic PlanSteps that can be executed safely by a Worker.',
        // Не дроби один пользовательский результат по файлам, архитектурным слоям, методам или отдельным техническим действиям.
        'Do not split one user-visible outcome by files, architectural layers, methods, or implementation mechanics.',
        // Изменения, которые имеют смысл только вместе, должны оставаться одним шагом.
        'Keep changes that are only meaningful together in the same PlanStep.',
        // Близкие проверки одного поведения не нужно превращать в отдельные шаги только из-за разных сценариев.
        'Keep closely related checks of the same behavior together instead of creating one PlanStep per test case.',
        '',
        '##message##',
      ].join('\n'),
    },
    worker: {
      change: {
        guidance: [
          // Работай только в границах текущего шага плана и не исследуй будущие шаги заранее.
          'Work only within the current PlanStep. Do not investigate entities that belong only to later PlanSteps.',
          // Не запрашивай Research просто ради большей уверенности: используй его только если без факта нельзя назвать конкретное изменение.
          'Do not request Research merely to increase confidence. Request it only when a missing project fact prevents a concrete edit for the current PlanStep.',
          // Уже полученные ответы Research и найденные candidate files считаются рабочим контекстом; не запрашивай тот же смысл повторно без противоречия.
          'Treat supplied Research knowledge and candidate files as usable evidence. Do not request the same fact again unless the supplied evidence is contradictory or insufficient for a concrete edit.',
          // Если информации достаточно для безопасного минимального изменения — переходи к edit intent, а не продолжай исследование.
          'When the available evidence is sufficient for a safe minimal change, produce edit intents instead of continuing discovery.',
        ],
      },
      research: {
        guidance: [
          // Отвечай ровно на один ограниченный вопрос о текущем проекте.
          'Answer exactly one bounded implementation question about the current project.',
          // Не расширяй задачу и не придумывай факты, которых нет в проекте.
          'Do not broaden the task, propose unrelated changes, or invent project facts.',
          // Предпочитай конкретные пути файлов, идентификаторы, существующие API и соглашения проекта.
          'Prefer concrete file paths, identifiers, existing APIs and current project conventions.',
          // Если простой факт уже подтверждён одним надёжным источником, не расширяй поиск без необходимости.
          'For a simple factual lookup, stop once the answer is supported by sufficient concrete project evidence.',
        ],
      },
      profiles: {
        code: {
          // Реализуй запрошенное изменение поведения программы или проекта.
          purpose: 'Implement the requested software/project behavior change.',
          // Используй существующие API и соглашения проекта; не меняй исходный код без необходимости.
          guidance: 'Prefer existing project APIs and conventions. Change source code only when required by the task.',
          strategy: 'range-replace',
        },
        documentation: {
          // Реализуй запрошенное изменение пользовательской/человеко-читаемой документации.
          purpose: 'Implement the requested human-facing documentation change.',
          // Предпочитай документационные файлы; runtime-код меняй только если задача прямо этого требует.
          guidance: 'Prefer documentation files and explanatory text. Do not modify runtime code unless the task explicitly requires it.',
          strategy: 'diff',
        },
      },
    },
  },
};

import type { NodusSettings } from './NodusSettings.js';

/**
 * Встроенные настройки Nodus. Пока они являются частью runtime-кода; позже этот объект
 * может стать основой для внешнего nodus.settings.ts/json и model-specific профилей.
 */
export const defaultNodusSettings: NodusSettings = {
  process: {
    planner: {
      template: [
        // По умолчанию пользовательский запрос считается одним PlanStep.
        'Default to ONE PlanStep.',
        // Несколько шагов допустимы только для действительно независимых пользовательских результатов.
        'Create multiple PlanSteps only when the user explicitly requests outcomes that remain useful and complete if the other outcomes are never implemented.',
        // Техническая структура реализации сама по себе не создаёт новые PlanSteps.
        'Dependencies, implementation layers, files, classes, methods, tests, validation cases, and supporting changes are NOT independent outcomes.',
        // Тесты запрошенного поведения являются частью того же результата, если пользователь явно не требует отдельный deliverable.
        'Tests that verify the requested behavior are part of the same outcome as the implementation. They are not an independently valuable outcome unless the user explicitly requests testing as a separate deliverable.',
        // Координированные изменения разных частей проекта относятся к одному шагу.
        'If one requested behavior requires coordinated changes across Store, Service, tests, or other parts of the project, all of those changes belong to the same PlanStep.',
        // Возможность технически выполнить работу по частям не является основанием для декомпозиции.
        'Do not create additional PlanSteps merely because parts of the work can technically be implemented separately or performed in sequence.',
        // Для каждого дополнительного шага проверяй его самостоятельную ценность для пользователя.
        'For every PlanStep after the first, ask: "Would this outcome still be complete and independently valuable to the user if all other PlanSteps were permanently abandoned?" If the answer is no, it belongs in the same PlanStep.',
        // Не добавляй работу, которую пользователь не просил.
        'Do not add documentation, refactoring, cleanup, validation, or other work unless explicitly requested.',
        '',
        '##message##',
      ].join('\n'),
    },
    worker: {
      change: {
        template: [
          // FindFile ищет только путь к файлу и никогда не читает его содержимое.
          'FindFile only locates project files and returns paths. It never reads or inspects file contents.',
          // ReadFile читает содержимое уже известного пути.
          'ReadFile reads the contents of an already known project path.',
          // Если путь уже известен, нельзя использовать FindFile для вопросов о содержимом этого файла.
          'If a required path is already present in candidateFiles or previous FindFile results, do not use FindFile to ask about signatures, methods, implementation details, imports, tests, or file structure. Use ReadFile.',
          // Любой retrieval-запрос должен оставаться полноценным ответом Change protocol с обязательным discriminator.
          'Always return outcome. When requesting FindFile, ReadFile, or Research, use outcome = "missing-information".',
          // Запрашивай только минимально необходимый следующий кусок информации.
          'Request only the minimum next information needed. Prefer one request and never add requests merely to fill a limit.',
          '',
          '##message##',
        ].join('\n'),
        guidance: [
          // Работай только в границах текущего шага плана и не исследуй будущие шаги заранее.
          'Work only within the current PlanStep. Do not investigate entities that belong only to later PlanSteps.',
          // Research — дорогая операция анализа нескольких источников. Не используй её для поиска файла, чтения известного файла, получения сигнатуры или другого прямого lookup.
          'Research is an expensive multi-source analysis operation. Do not request Research for file discovery, reading a known file, method signatures, or other direct lookups.',
          // Не запрашивай Research ради уверенности. Он допустим только когда конкретный вывод о проекте нельзя получить из одного прямого источника.
          'Do not request Research merely to increase confidence. Request it only when the current PlanStep requires a project-level conclusion that cannot be obtained from one direct source.',
          // Уже полученные ответы Research и найденные candidate files считаются рабочим контекстом; не запрашивай тот же смысл повторно без противоречия.
          'Treat supplied Research knowledge and candidate files as usable evidence. Do not request the same conclusion again unless the supplied evidence is contradictory or insufficient.',
          // Если информации достаточно для безопасного минимального изменения — переходи к edit intent, а не продолжай исследование.
          'When the available evidence is sufficient for a safe minimal change, produce edit intents instead of continuing discovery.',
        ],
      },
      research: {
        guidance: [
          // Research должен синтезировать одно конкретное знание о проекте из нескольких релевантных источников.
          'Synthesize one bounded piece of project knowledge from multiple relevant sources.',
          // Прямой lookup пути, содержимого одного известного файла или сигнатуры не является Research-задачей.
          'Do not treat direct file lookup, reading one known source, or extracting a method signature as Research.',
          // Не расширяй задачу и не придумывай факты, которых нет в проекте.
          'Do not broaden the task, propose unrelated changes, or invent project facts.',
          // Предпочитай вывод, который объясняет project convention, architecture или другое отношение между источниками.
          'Prefer conclusions about project conventions, architecture, or relationships between sources over restating raw file content.',
          // Остановись, когда для вывода уже есть достаточно конкретных подтверждений.
          'Stop once the requested conclusion is supported by sufficient concrete project evidence.',
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

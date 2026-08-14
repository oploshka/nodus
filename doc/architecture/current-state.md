# Текущее состояние / handoff

Этот документ — короткая точка восстановления контекста. Он описывает текущее состояние Nodus 0.4, а не историю всех архитектурных решений.

## Архитектурная модель

Верхние слои:

- `app` — startup, composition, CLI и concrete logging;
- `engine` — task lifecycle, Planner, Determine, Worker, Research, Edit и Validation;
- `model` — граница с LLM/provider transport, response formats/schema, `ModelRunner`/`ModelCaller` и model capabilities.

Основной путь:

```text
App / CLI
  -> Engine.run(task)
  -> Planner -> Plan
  -> для каждого PlanStep:
       Determine -> Worker
       Worker -> bounded Actions / Research when needed
       Worker -> WorkerResult + semantic ProjectEditRequest
       Engine -> ProjectEditor -> prepare / recover / fallback / commit
       Engine -> Validation
       Engine -> следующий PlanStep
```

Engine не управляет внутренними attempts Worker и не должен понимать конкретные Research-вопросы. При этом границы, где результат Worker становится состоянием Project, принадлежат Engine.

## Planner

Planner строит небольшой semantic plan. `PlanStep` описывает outcome, explicit constraints и причину декомпозиции.

Используются фиксированные decomposition types:

- `coherent-outcome`;
- `independent-outcome`;
- `dependency`;
- `separate-deliverable`.

Файлы, слои, Research, Validation и другие technical phases сами по себе не являются причиной создавать отдельный `PlanStep`.

## Worker / Actions

Worker выполняет один `PlanStep` через ограниченный набор Actions.

`ChangeCodeAction` определяет semantic edit intent и может запросить конкретную недостающую информацию через `ResearchAction`. Техническая materialization изменения не принадлежит Worker.

Worker возвращает Engine:

- `completed`;
- `not-completed` + возможность будущего continuation;
- `failed`.

Настоящий resume того же Worker instance пока не реализован.

## Research

Research — bounded service с persistent cache. Cache entry хранит source files и hashes; ответ используется повторно, пока связанные sources остаются актуальными. `not-found` не кешируется.

Текущая открытая область — semantic dedupe похожих вопросов, более точная фиксация фактически использованных evidence и будущая работа Research поверх virtual workspace.

## Engine-owned Edit

Worker возвращает semantic `ProjectEditRequest` (`path + instruction` и optional preferred strategy). `ProjectEditor` владеет authoritative source, EditStrategy, applicator, buffered state и commit.

Текущие стратегии:

- `range-replace`;
- exact `replace`;
- unified `diff`;
- full-file `edit`.

Все изменения одного coherent result сначала готовятся в памяти. Несколько edits одного файла видят buffered результат предыдущих edits. До первой записи проверяются target paths и stale-source guards.

Technical recovery выполняется внутри Edit layer без повторного запуска Worker. Для `range-replace` есть один bounded localization retry. После неуспешной подготовки Editor может перейти к следующей зарегистрированной стратегии, сохраняя исходный semantic intent. Базовые цепочки: `range-replace -> diff -> edit`, `replace -> diff -> edit`, `diff -> edit`.

## Validation

Validation уже является отдельной Engine-owned lifecycle boundary после Worker/Edit. Текущая реализация `PassValidator` всегда возвращает `passed` и нужна только для фиксации слоя.

Реальные validators, порядок pre/post-commit validation, recovery и rollback semantics ещё не определены. См. [`validation.md`](validation.md).

## Project paths и internal storage

Внутри engine используются canonical project-root-relative paths. Model-provided paths считаются untrusted input и проходят через `ProjectPathResolver`.

Hard-protected paths и project excludes участвуют в write policy. Разделение Nodus-owned internal storage (`.nodus`) и model-editable project paths остаётся отдельной незакрытой задачей.

## Языковая policy

Конфиг разделяет:

- `language.project` — human-authored текст внутри проекта;
- `language.nodus` — machine-facing данные Nodus;
- `language.response` — user-facing текст.

Общая machine-facing policy централизована в `ModelLanguagePolicy`; конкретные Planner/Worker/Research prompts сохраняют только собственную semantic guidance. Идентификаторы, пути и code symbols не переводятся.

## CLI / logs

Multiline input:

- `Enter` — новая строка;
- `Ctrl+Enter` или `Ctrl+D` — submit;
- `Ctrl+C` — cancel; на пустом input — exit;
- `/exit` — явный выход.

Console показывает человекочитаемый progress. Полный model exchange и diagnostic payload пишутся в `.nodus/logs/*-nodus.log`.

## Tests и benchmark

Vitest projects: `unit`, `integration`, `model`, `e2e`.

Deterministic integration scenarios фиксируют runtime boundaries, а не intelligence модели. Отдельные benchmark'и используются для model/edit capability и raw-agent comparison.

## Ближайшие направления

Актуальный порядок и более длинный список находятся в [`../development/roadmap.md`](../development/roadmap.md). Основные открытые темы сейчас:

1. Validation v2;
2. дальнейшая проверка Engine-owned Edit и strategy behavior на mock project;
3. virtual workspace / task-wide commit;
4. Research v2;
5. Planner decomposition и будущий replanning;
6. model capability measurements;
7. language policy live-run verification;
8. task statistics v2;
9. console dogfooding;
10. disposable-project rule;
11. internal storage boundary, Worker continuation и user interaction/control points — отдельные отложенные runtime-задачи.

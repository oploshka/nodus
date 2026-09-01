# Текущее состояние / handoff

Этот документ — короткая точка восстановления контекста. Он описывает текущее состояние Nodus 0.5, а не историю всех архитектурных решений.

## Архитектурная модель

Верхние слои:

- `app` — startup, composition, CLI и concrete logging;
- `engine` — task lifecycle, Process runtime, Planner, Worker, Research, Edit и EngineTest;
- `model` — граница с LLM/provider transport, response formats/schema, `ModelRunner`/`ModelCaller` и model capabilities.

Версия 0.5 фиксирует переход к schema-driven Process runtime. Core определяет фиксированные `STEP`, исполняет `SEQUENCE`, хранит local context/output и разрешает controlled transition хвоста. Planner и Worker могут вернуть Core локальную schema; automation определяет конкретное versioned поведение, но не исполняет schema самостоятельно.

Новый Process contract уже существует рядом с production Engine path. Полная миграция Engine lifecycle на Process ещё не завершена, поэтому часть 0.4 mechanics пока остаётся compatibility path.

## Process / automation

`src/engine/Process/` содержит execution mechanics. `src/engine/Automation/` содержит только loader versioned automation package.

Основная граница:

```text
automation module
  -> OUTPUT | SCHEMA / implementation description
  -> ProcessRuntime
  -> Core validates and executes
```

Concrete `WorkerCode`, `WorkerDocumentation` и `WorkerAgent` находятся в `automation/Worker/`. Core определяет Worker contracts и shared mechanics.

Для Process Worker поддерживаются два implementation type:

- `SCHEMA` — Worker предоставляет локальную Process schema;
- `METHOD` — Worker предоставляет custom `run(request)`.

`WorkerRunner` является adapter `STEP.WORKER -> Worker implementation`, а не base class конкретного Worker.

## Текущая production Engine логика

```ts
Engine(task) {
  const edit = createEdit()

  // несколько PlanStep используют один task-local Edit
  Worker.run(step1, edit)
  checkpoint = edit.state()

  Worker.run(step2, edit)

  if (step2.failed)
    edit.restore(checkpoint)

  // ...

  edit.apply()
  EngineTest.run()
}
```

Engine не управляет внутренними attempts Worker и не должен понимать конкретные Research-вопросы. Он владеет task-level Edit, checkpoints и моментом физического apply.

## Planner

Production Planner пока строит небольшой semantic plan. `PlanStep` описывает outcome, explicit constraints и причину декомпозиции.

Используются фиксированные decomposition types:

- `coherent-outcome`;
- `independent-outcome`;
- `dependency`;
- `separate-deliverable`.

Файлы, слои, Research, Edit validation и EngineTest сами по себе не являются причиной создавать отдельный `PlanStep`.

В Process 0.5 Planner может вернуть локальную schema, а transition/replan меняет только невыполненный хвост текущей `SEQUENCE`.

## Worker / Actions

Core Worker API и concrete automation Workers разделены.

Schema-driven Worker наследует `WorkerSchema` и предоставляет `getSchema()`. Custom Worker наследует `WorkerMethod` и предоставляет `run()`. `getImplementation()` сообщает Core, какой путь использовать.

Production code/documentation flow пока использует Core `WorkerIterativeRunner`; concrete классы вынесены в `automation/Worker/`. Это временный compatibility path до появления подтверждённой Worker schema для code execution.

`ChangeCodeAction` определяет semantic edit intent. `WorkerIterativeRunner` передаёт intent в `Edit.change()`, а Research при необходимости читает файлы через `Edit.read()`.

Worker возвращает production Engine:

- `completed`;
- `not-completed` + возможность будущего continuation;
- `failed`.

Engine не должен знать, какие Actions Worker счёл необходимыми. Настоящий resume того же Worker instance пока не реализован.

## Research

Research — bounded service с persistent cache. Cache entry хранит source files и hashes; `not-found` не кешируется.

Research, вызванный из `WorkerIterativeRunner`, может читать source content через текущий Edit, поэтому следующий step способен увидеть накопленные изменения предыдущего. Cache/hash semantics пока остаются основанными на физическом Project и могут не учитывать task-local content.

## Engine-owned Edit

`ProjectEditor` создаётся отдельно для Task и хранит map существующих изменённых файлов: original content + current task-local content.

Основные операции:

- `read(path)` — task-local content, затем Project;
- `change(...)` — materialize semantic intent через EditStrategy, проверить batch через `EditValidator` и только потом накопить результат;
- `state()` / `restore()` — step-level checkpoint;
- `apply(state?)` — физически записать накопленное состояние.

Текущие стратегии:

- `range-replace`;
- exact `replace`;
- unified `diff`;
- full-file `edit`.

Technical recovery/fallback остаётся внутри Edit. Последующие изменения одного файла работают относительно уже накопленного content.

`EditValidator` проверяет подготовленный batch до попадания в task-local state. `EditValidationJsonCheck` сейчас трактует strict JSON parse failure как warning, а не blocking failure.

`WorkerAgent` использует generic Core `WorkerAgentRunner`, который подключает `file-system read/write` к Edit. Search/Terminal/Git пока продолжают видеть физический Project. Create/delete/move в task-local Edit пока не поддержаны.

## EngineTest

После успешного `Edit.apply()` Engine запускает `EngineTest` — общую project-level проверку результата Task.

Текущие реализации:

- `ResolveEngineTest` — явный no-op success;
- `TypecheckEngineTest` — configured typecheck command;
- `UnitEngineTest` — configured unit-test command;
- `CompositeEngineTest` — последовательный запуск нескольких EngineTest.

Конкретные команды задаются конфигурацией. Старый общий слой `Validation` больше не является runtime boundary: его обязанности разделены между `EditValidator` и `EngineTest`.

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

Deterministic Process tests фиксируют schema execution, local context, transitions и module boundaries. Отдельные benchmark'и используются для model/edit capability и raw-agent comparison.

## Ближайшие направления

1. продолжить миграцию production lifecycle на Process 0.5 без дублирования Planner/Worker semantics;
2. проверить Worker `SCHEMA / METHOD` boundary и перевести `WorkerCode` на schema только после реального сценария;
3. стабилизировать task-local Edit mechanics и чтение накопленного состояния;
4. определить partial apply / user decision при незавершённой Task;
5. Research v2 и task-local cache/hash semantics при реальной необходимости;
6. проверить replanning/transition на реальных failure cases;
7. model capability measurements;
8. language policy live-run verification;
9. task statistics v2 и console dogfooding;
10. internal storage boundary, Worker continuation и user interaction/control points — отдельные отложенные runtime-задачи.

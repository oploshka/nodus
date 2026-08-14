# Текущее состояние / handoff

Этот документ — короткая точка восстановления контекста. Он описывает текущее состояние Nodus 0.4, а не историю всех архитектурных решений.

## Архитектурная модель

Верхние слои:

- `app` — startup, composition, CLI и concrete logging;
- `engine` — task lifecycle, Planner, Determine, Worker, Research, Edit и Validation;
- `model` — граница с LLM/provider transport, response formats/schema, `ModelRunner`/`ModelCaller` и model capabilities.

Текущая логика Engine:

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
  Validation.run() // временная post-apply граница
}
```

Engine не управляет внутренними attempts Worker и не должен понимать конкретные Research-вопросы. Он владеет task-level Edit, checkpoints и моментом физического apply.

## Planner

Planner строит небольшой semantic plan. `PlanStep` описывает outcome, explicit constraints и причину декомпозиции.

Используются фиксированные decomposition types:

- `coherent-outcome`;
- `independent-outcome`;
- `dependency`;
- `separate-deliverable`.

Файлы, слои, Research, Validation и другие technical phases сами по себе не являются причиной создавать отдельный `PlanStep`.

## Worker / Actions

Worker выполняет один `PlanStep` через ограниченный набор Actions и получает task-local Edit как execution tool.

`ChangeCodeAction` определяет semantic edit intent. `IterativeWorker` передаёт intent в `Edit.change()`, а Research при необходимости читает файлы через `Edit.read()`.

Worker возвращает Engine:

- `completed`;
- `not-completed` + возможность будущего continuation;
- `failed`.

Engine не должен знать, какие Actions Worker счёл необходимыми. Настоящий resume того же Worker instance пока не реализован.

## Research

Research — bounded service с persistent cache. Cache entry хранит source files и hashes; `not-found` не кешируется.

Research, вызванный из `IterativeWorker`, может читать source content через текущий Edit, поэтому следующий step способен увидеть накопленные изменения предыдущего. Cache/hash semantics пока остаются основанными на физическом Project и могут не учитывать task-local content.

## Engine-owned Edit

`ProjectEditor` создаётся отдельно для Task и хранит простую map существующих изменённых файлов: original content + current task-local content.

Основные операции:

- `read(path)` — task-local content, затем Project;
- `change(...)` — materialize semantic intent через EditStrategy и накопить результат;
- `state()` / `restore()` — step-level checkpoint;
- `apply(state?)` — физически записать накопленное состояние.

Текущие стратегии:

- `range-replace`;
- exact `replace`;
- unified `diff`;
- full-file `edit`.

Technical recovery/fallback остаётся внутри Edit. Последующие изменения одного файла работают относительно уже накопленного content.

`AgentWorker` также подключает `file-system read/write` к Edit. Search/Terminal/Git пока продолжают видеть физический Project. Create/delete/move в task-local Edit пока не поддержаны.

## Validation

Обычный Bootstrap использует `CompositeValidator` с bounded deterministic `ValidationCheck` (`JsonValidationCheck`, configured `CommandValidationCheck`; `PassValidator` остаётся compatibility/test implementation).

Validation пока оставлена после `Edit.apply()` как временная граница. Распределение между будущим `EditValidator`, Worker-level testing и итоговыми Engine checks ещё не определено и сознательно отложено до стабилизации Edit mechanics.

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

1. стабилизировать task-local Edit mechanics и чтение накопленного состояния;
2. перераспределить Validation после того, как станет понятна новая граница Edit;
3. определить partial apply / user decision при незавершённой Task;
4. Research v2 и task-local cache/hash semantics при реальной необходимости;
5. Planner decomposition и будущий replanning;
6. model capability measurements;
7. language policy live-run verification;
8. task statistics v2;
9. console dogfooding;
10. disposable-project rule;
11. internal storage boundary, Worker continuation и user interaction/control points — отдельные отложенные runtime-задачи.

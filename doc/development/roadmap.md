# Nodus 0.3 roadmap

Roadmap фиксирует текущее состояние spike и ближайшие архитектурные работы. Старые v0.2 abstractions не являются compatibility contract.

## Уже собрано

- [x] Три верхних слоя `app / engine / model`.
- [x] `Engine.run()` как coordinator global task lifecycle.
- [x] Semantic Planner с `goal + constraints + decompositionType`.
- [x] Fixed Planner decomposition reasons: coherent/independent/dependency/separate-deliverable.
- [x] `Determine` как bounded option-selection service.
- [x] Worker statuses `completed / not-completed / failed`.
- [x] `CodeWorker`, `DocumentationWorker`, `AgentWorker`; default Worker отсутствует.
- [x] Worker Actions как executable capabilities, а не prompt descriptions.
- [x] `CodeWorker -> ChangeCodeAction -> ResearchAction -> retry` lifecycle.
- [x] Вынести edit strategies из Worker Actions в Engine-owned `src/engine/Edit`.
- [x] Multi-file coherent edits: Worker возвращает semantic intents, Editor готовит и коммитит набор атомарно.
- [x] Local edit recovery внутри Engine EditStrategy без полного replanning всей задачи.
- [x] Engine EditStrategy: range-replace / exact replace / unified diff / full-file edit.
- [x] Bounded Research + persistent source-hash cache invalidation.
- [x] `ProjectPathResolver`: root-relative canonical paths, dirty/absolute/file URL parsing, existence check и unambiguous index repair.
- [x] Write policy для hard-protected `node_modules/.git` и project excludes.
- [x] `ModelRunner`, common response schema, `ModelCaller`, `diffFile()` facade.
- [x] Config languages `project / nodus / response`.
- [x] Human console progress + full timestamped file logs.
- [x] Multiline CLI input и explicit completed/not-completed/failed output.
- [x] Vitest unit/integration/model/e2e layout + Nodus scenario framework.
- [x] Deterministic integration scenarios `/status` и `runtime.maxPlanSteps`.
- [x] Raw-agent benchmark как контрольная группа.

## Ближайшие работы

- [ ] **Разделить Nodus internal storage и model-editable project paths.** Сейчас `.nodus` временно разрешён write resolver'ом, чтобы Research cache/index могли сохраняться через общий Project API. Нужен отдельный internal storage API; после этого model Actions снова блокируют `.nodus`.
- [ ] **Централизовать language policy в model layer.** Internal Nodus language по умолчанию English; `project` и `response` остаются отдельными configurable hints. Не дублировать правило языка в каждом Action/Service prompt.
- [ ] На mock project сравнить Editor strategies по apply success, token cost и recovery frequency.
- [ ] После benchmark определить Engine-level fallback/routing между range-replace / replace / diff / full edit.
- [ ] Реализовать настоящий Engine/Worker continuation для `not-completed` (`/continue` не должен становиться новой user task).
- [ ] Определить минимальный API user interaction/control points: approval, correction, interrupt, required/timeout/none.
- [ ] Разделить AgentWorker `completed` и «нужен пользовательский input».
- [ ] Уточнить Research evidence dependencies и cache precision.
- [ ] Решить project-wide persistent ResearchStore vs task-local overlay поверх project cache.
- [ ] Добавлять новые Actions (`RunCommandAction`, documentation и др.) только по реальным задачам.
- [x] Добавлен минимальный Engine-owned Validation boundary с `PassValidator`; реальные проверки отложены до появления понятного contract (см. `src/engine/Validation/VALIDATION.md`).
- [ ] Определить минимальный публичный API Engine по реальным потребностям app; пока гарантирован `run()`.
- [ ] Продолжить накопление execution samples для task clustering/Worker statistics/Determine optimization.

## Идеи взаимодействия (зафиксированы, не реализованы)

- предложение изменений перед применением;
- подтверждение/отклонение/коррекция пользователем по стабильному interaction id/tags;
- прерывание активного run пользователем;
- режимы ожидания `required`, `timeout`, `none`;
- fallback по timeout: `continue | pause | cancel`;
- конфигурируемая policy, а не CLI-specific logic внутри Worker.

## Не переносим автоматически из v0.2

- `PlanExecutor` / `StepRegistry` / старую линейную search-understand-prepare-change цепочку;
- `Requirement*` hierarchy;
- старый `RecoveryController`;
- `OperationProfile/OperationRegistry` как orchestration abstraction;
- старый `ModelController` целиком.


## Эксперименты со стратегиями редактирования

- `range-replace`, `replace`, `diff` и full-file `edit` являются Engine EditStrategy, не Worker Actions.
- Worker сообщает semantic `path + instruction` и preferred strategy; Editor владеет authoritative source, serialization, applicator и atomic commit.
- Benchmark должен сравнивать стратегии через один и тот же `ProjectEditor` contract.
- Fallback/routing между стратегиями добавлять после измерений, а не заранее.

## Идея: изолированный Workspace Worker (требует отдельной проработки)

Идея пока **не считается утверждённой архитектурой** и не должна внедряться без отдельного прохода по контрактам Engine/Worker/Research/Project.

Предполагаемая граница:

```text
Engine владеет реальным Project
  -> создаёт Worker Workspace / ProjectView
Worker выполняет PlanStep только поверх Workspace
  -> ChangeCode меняет виртуальное состояние
  -> Research читает то же виртуальное состояние
WorkerResult возвращает итоговый ChangeSet
Engine применяет изменения к реальному Project только после успешного завершения всей задачи
```

Ключевой смысл: незавершённый Worker или промежуточный успешно выполненный PlanStep не должны оставлять частично применённые изменения в реальном проекте. В идеальном варианте Engine коммитит накопленные изменения только после того, как успешно завершены **все** шаги пользовательской задачи.

Для Worker нужен единый `ProjectView`, который сначала смотрит в его локальные изменения, а затем в базовый Project. Поэтому последующий Research должен видеть файлы уже такими, какими Worker считает их после своих виртуальных правок.

Варианты хранения виртуальных файлов пока открыты:

- **in-memory overlay** (`Map<ProjectPath, content>`) — основной простой кандидат; дешёвый, быстрый и автоматически исчезает при завершении процесса;
- `.nodus/fileCache` — возможный более поздний вариант для больших файлов, долгих/возобновляемых run или восстановления после перезапуска;
- гибрид: память как primary storage, disk cache только как explicit spill/persistence mechanism.

Пока предпочтение — **не вводить `.nodus/fileCache` заранее**. Сначала проверить, хватает ли in-memory overlay на реальных задачах. Disk cache добавлять только при появлении измеримой необходимости (resume после restart, большой объём buffered data, ограничение памяти и т.п.).

Research требует отдельного правила кэширования:

- Research по неизменённому base Project может использовать persistent `ResearchCache`;
- Research, ответ которого зависит от виртуально изменённых файлов Workspace, не должен сразу становиться глобальным знанием о реальном Project; такое знание должно оставаться worker-local до commit или иметь отдельную workspace identity/version.

Также нужно отдельно решить commit semantics Engine: atomic-ish применение всего task-level ChangeSet, конфликт с внешними изменениями файлов во время долгого run, rollback/temporary files и взаимодействие с будущим user approval.

## Model capability benchmark

- [x] Добавить отдельный `target/benchmark/model-capabilities`, который запускает реальные `CodeWorker` + ChangeCode Actions с заранее подсунутым edit intent, чтобы отдельно измерять механику `replace` / `range-replace` / `diff` / `edit` без Planner/Research шума.
- [ ] Собрать baseline для используемых моделей: correctness, schema/apply failures, duration, model calls и token cost по каждой edit-стратегии.
- [ ] На основании benchmark определить минимальный capability threshold для модели, пригодной как основной `CodeWorker`.

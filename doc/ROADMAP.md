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
- [x] Разделить code-edit strategy на explicit Actions: replace / diff / full edit; `CodeWorker` пока запускает только replace для controlled live test.
- [x] Multi-file coherent edits в `ChangeCodeAction`.
- [x] Local edit recovery конкретного edit без полного replanning всей задачи.
- [x] `ChangeCodeReplaceAction`: exact before/after blocks + line hint, bottom-up apply, one local regeneration.
- [x] `ChangeCodeEditAction`: complete resulting-file strategy (пока не routed).
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
- [ ] Повторить live `runtime.maxPlanSteps` через `ChangeCodeReplaceAction`; сравнить apply success, token cost и recovery frequency с прежним diff pipeline.
- [ ] После replace experiment определить fallback/routing между replace -> diff -> full edit (не добавлять routing заранее без данных).
- [ ] Реализовать настоящий Engine/Worker continuation для `not-completed` (`/continue` не должен становиться новой user task).
- [ ] Определить минимальный API user interaction/control points: approval, correction, interrupt, required/timeout/none.
- [ ] Разделить AgentWorker `completed` и «нужен пользовательский input».
- [ ] Уточнить Research evidence dependencies и cache precision.
- [ ] Решить project-wide persistent ResearchStore vs task-local overlay поверх project cache.
- [ ] Добавлять новые Actions (`RunCommandAction`, documentation и др.) только по реальным задачам.
- [ ] Добавить Validation layer только после появления понятного validation contract.
- [ ] Определить минимальный публичный API Engine по реальным потребностям app; пока гарантирован `run()`.
- [ ] Продолжить накопление execution samples для task clustering/Worker statistics/Determine optimization.

## Interaction ideas (зафиксированы, не реализованы)

- proposal before apply;
- user approve/reject/correct по stable interaction id/tags;
- user interrupt активного run;
- `required`, `timeout`, `none` wait modes;
- timeout fallback `continue | pause | cancel`;
- конфигурируемая policy, а не CLI-specific logic внутри Worker.

## Не переносим автоматически из v0.2

- `PlanExecutor` / `StepRegistry` / старую линейную search-understand-prepare-change цепочку;
- `Requirement*` hierarchy;
- старый `RecoveryController`;
- `OperationProfile/OperationRegistry` как orchestration abstraction;
- старый `ModelController` целиком.


## Editing strategy experiments

- Live-test `ChangeCodeRangeReplaceAction` with small guarded ranges (`startLine/endLine + expected + replacement`) as the primary CodeWorker strategy.
- Keep `ChangeCodeReplaceAction` and `ChangeCodeDiffAction` for comparison.
- Keep `ChangeCodeEditAction` as the implemented full-file strategy and decide later how Worker routing/fallback should select it.
- Code-changing Actions must prepare the whole coherent change-set in memory before committing files.

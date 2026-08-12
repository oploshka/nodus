# Nodus 0.3 roadmap

Roadmap фиксирует только текущие архитектурные решения и ближайшие проверки. Старые v0.2 orchestration-костыли не считаются обязательным compatibility contract.

## Готово в текущем spike

- [x] Три верхних слоя: `app / engine / model`.
- [x] `app` оставлен composition root / DI + CLI boundary.
- [x] `Engine.runTask()` сведен к координации task loop.
- [x] High-level Planner отделён от Worker execution planning.
- [x] `DefaultWorker` агрегирует `ExecutionPlanner + ExecutionState + ExecutionAction[]`.
- [x] Research вынесен в bounded service с source-hash cache invalidation.
- [x] Первый vertical slice `/status`: `research -> edit-file`.
- [x] Vitest + Nodus-specific `test/framework`.
- [x] Один timestamped test log на scenario run.
- [x] Восстановлен самостоятельный `model` layer: adapter/request/prompt/profile/tools.
- [x] Добавлен `ModelRunner` как единая точка runtime-вызовов LLM.
- [x] Response parsing перенесён в `model/Response`; engine получает typed JS objects, а не raw model text.
- [x] Полезные model tools возвращены под `src/model/Tool`.
- [x] Зафиксирован новый `ModelRunner` contract: message/data/guidance + request/response formats + schema + per-call settings.
- [x] `diffFile()` добавлен как первый thin specialized facade; отдельный `type` пока не вводится.
- [x] Восстановлен raw-agent benchmark как отдельная контрольная группа.
- [x] Добавлена design-документация `src/model/RESPONSE-FORMATS.md`.

## Следующее

- [ ] На реальном `/status` проверить новый ModelRunner contract (request/response/schema/diffFile) с локальной 14B.
- [ ] Разобрать границу `ExecutionPlanner` / `ExecutionAction` на втором сценарии, не добавляя новые action-типы заранее.
- [ ] Решить ownership обновления `ExecutionState` после получения `ActionResult`.
- [ ] Уточнить Research evidence dependencies: cache сейчас может зависеть от всех прочитанных candidate files, а не только от реально использованных источников.
- [ ] Решить, нужен ли project-wide persistent ResearchStore по умолчанию или task-local overlay поверх project cache.
- [ ] Добавить отдельный Validation layer только после появления понятного validation contract.
- [ ] Определить минимальный публичный API Engine по реальным потребностям app; пока гарантирован только `runTask()`.
- [ ] Добавить настоящий model scenario на том же Scenario contract, что deterministic integration test.

## Не переносим автоматически из v0.2

- `PlanExecutor` / `StepRegistry` / старую линейную search-understand-prepare-change цепочку;
- `Requirement*` hierarchy;
- старый `RecoveryController`;
- `OperationProfile/OperationRegistry` как orchestration abstraction;
- старый `ModelController` целиком.

Полезные низкоуровневые идеи из старого model layer переносятся отдельно. Его orchestration-роли теперь должны принадлежать `ModelRunner`, Engine или Worker, а не одному центральному controller.

# Nodus 0.4 roadmap

Roadmap фиксирует уже собранные boundaries и следующие направления работы. Он не является полным описанием архитектуры и не превращает research-гипотезы в обязательный план реализации.

## Уже собрано

- [x] Верхние слои `app / engine / model`.
- [x] `Engine.run()` как coordinator task lifecycle.
- [x] Semantic Planner с `goal + constraints + decompositionType`.
- [x] Bounded `Determine` для выбора из ограниченного набора options.
- [x] Worker statuses `completed / not-completed / failed` и explicit Actions.
- [x] Worker-driven Research только при concrete missing information.
- [x] Bounded Research с persistent source-hash cache invalidation.
- [x] Engine-owned Edit: Worker возвращает semantic intent, `ProjectEditor` владеет materialization и commit.
- [x] `range-replace`, exact `replace`, unified `diff`, full-file `edit` как `EditStrategy`.
- [x] Buffered coherent multi-file preparation, stale-source guard и atomic-ish commit/rollback.
- [x] Bounded Edit recovery и fallback без повторного semantic reasoning Worker.
- [x] Engine-owned Validation boundary с `PassValidator`.
- [x] Canonical project-root-relative paths и `ProjectPathResolver`.
- [x] Разделение `language.project / language.nodus / language.response` и общий `ModelLanguagePolicy`.
- [x] Human-readable console + полный file log.
- [x] Unit/integration/model/e2e test layout и scenario framework.
- [x] Raw-agent control benchmark и model-capabilities benchmark harness.
- [x] Базовая task/execution statistics.
- [x] Disposable Todo mock-project для безопасного dogfooding.
- [x] Документация разделена на current architecture, development, project rules, history и research; восстановлены origin/evolution, decision log и failure catalog.

## Ближайшие направления

1. **Validation v2.** Определить реальные validators (typecheck, tests, config/schema parsing), порядок относительно commit, failure semantics, recovery и rollback. Текущий `PassValidator` остаётся intentional skeleton.
2. **Edit strategy verification.** Прогнать реальные mock-project задачи через Engine-owned Editor, проверить recovery/fallback и разделять semantic correctness, contract correctness и apply success.
3. **Virtual workspace / task-wide commit.** Исследовать in-memory overlay, где последующие Worker/Research видят виртуально изменённое состояние, а Engine пишет реальный Project после успешного завершения Task. Подробности: [`../research/virtual-workspace.md`](../research/virtual-workspace.md).
4. **Research v2.** Semantic dedupe перефразированных вопросов, более точные evidence dependencies/invalidation и корректная работа поверх будущего Workspace.
5. **Planner decomposition.** Проверять coherent outcomes на реальных задачах; позже отдельно рассмотреть nested steps, replanning и отношения между steps, если появится подтверждённая необходимость.
6. **Model capability measurements.** Продолжить измерения `range-replace / replace / diff / edit`, отделяя понимание изменения, выражение contract и semantic correctness результата.
7. **Language policy live run.** Проверить реальный лог при `language.nodus=en` и различать prompt bug от непослушания конкретной модели.
8. **Task statistics v2.** После появления реального Validation и устойчивой Edit semantics добавить validation runs/failures и более точную Edit statistics.
9. **Console dogfooding.** Прогнать Todo mock-project через полный `Planner -> Worker -> Research -> Edit -> Validation -> summary` и менять Presentation только по наблюдаемым проблемам.
10. **Disposable project rule.** Не использовать рабочий Nodus repository как основной destructive target; закрепить безопасный dogfooding/benchmark workflow.

## Отложенные runtime-задачи

Эти вопросы остаются реальными, но не должны вытеснять ближайший execution/validation loop без нового failure case:

- разделение Nodus-owned internal storage (`.nodus`) и model-editable Project API;
- настоящий Worker/Engine continuation для `not-completed`;
- user interaction/control points: approval, correction, interrupt, pause/resume, timeout semantics;
- более точная semantics `AgentWorker` для случаев, где требуется user input;
- минимальный публичный API Engine помимо `run()`;
- новые Actions только по подтверждённым задачам.

## Research-направления

Project Understanding, task classification, task-specific expertise и будущая связь task profile с measured model capabilities сохраняются как research-гипотезы, а не как утверждённый runtime design. См. [`../research/architecture-evolution.md`](../research/architecture-evolution.md).

Старые `Requirement*`, `PlanExecutor`, `StepRegistry`, `RecoveryController`, `OperationProfile/OperationRegistry` и прежний `ModelController` не являются compatibility contract и не должны возвращаться только ради сохранения старой архитектуры.

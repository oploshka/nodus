# Planner

В Nodus 0.5 новый Planner строится по той же границе, что и Worker: automation-facing contract отдельно от Core runner/resolver и отдельно от старой production реализации.

```text
src/engine/Process/Planner/
  Contract/
    PlannerSchema.ts
    PlannerMethod.ts
    PlannerTsType.ts

  PlannerRunner.ts
  PlannerResolver.ts

  Deprecated/
    Plan.ts
    Planner.ts
    ModelPlanner.ts
    PlannerModule.ts
    PlannerResolver.ts
    PlannerTsType.ts
```

## Contract

`Contract/` — API для новых automation Planners. Planner сообщает Core способ исполнения через `getImplementation()`:

- `SCHEMA` — Planner предоставляет локальную Process schema;
- `METHOD` — Planner предоставляет custom `run(request)`.

`PlannerSchema` требует `getId()` + `getSchema()`. `PlannerMethod` требует `getId()` + `run()`.

Planner request содержит `operation: PLAN | REPLAN`, task и Process context. Qualification намеренно не является частью Planner contract.

Это фиксирует границу:

```text
Qualifier decides classification
Planner decides planning/replanning behavior
ProcessRuntime executes returned schema
```

## Runner / Resolver

`PlannerRunner` — Process adapter для `STEP.PLAN` или `STEP.REPLAN`. Он выбирает Planner, читает его implementation type и либо возвращает schema Core, либо вызывает method.

`PlannerResolver` выполняет только deterministic selection:

- `step.preset` -> exact Planner id;
- один доступный Planner -> использовать его;
- несколько Planners без `preset` -> error.

Semantic selection policy не должна появляться внутри Resolver без отдельной подтверждённой необходимости.

```text
STEP.PLAN / STEP.REPLAN
  -> PlannerRunner
  -> PlannerResolver
  -> Planner.getImplementation()
       -> SCHEMA -> ProcessRuntime
       -> METHOD -> custom method
```

## Deprecated

`Deprecated/` хранит старую Planner модель: `Task -> Plan -> PlanStep`, production `ModelPlanner`, а также промежуточный `iProcessPlanner` с `qualify/plan/replan` и `PlannerModule`.

Эти типы оставлены как исторический/compatibility path и не задают форму нового Planner contract. В частности, наличие `qualify()` в старом `iProcessPlanner` не переносится в новую архитектуру.

Новый Planner следует развивать от `Contract/` независимо от старого `PlanStep` API. Когда новый path станет достаточным для production lifecycle, deprecated слой можно удалять целиком, а не адаптировать его бесконечно.

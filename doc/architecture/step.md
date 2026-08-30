# Step

`Step/` — новая ветка Process architecture в Nodus 0.5. Она не переписывает существующие `Worker/` и `Planner/` на месте: текущая структура остаётся как переходная реализация, а общая механика строится отдельно и проверяется на нескольких semantic roles.

## Общая механика

`STEP.WORKER`, `STEP.PLAN`, `STEP.ACTION` и будущие `QUALIFY` / `VALIDATE` остаются разными элементами языка Process. Универсализируется только способ исполнения:

```text
semantic STEP
  -> StepRunner
  -> StepResolver
  -> implementation
       -> SCHEMA -> ProcessRuntime
       -> METHOD -> run(request)
```

`StepSchema` и `StepMethod` задают общий automation-facing execution contract. `StepResolver` выполняет только deterministic selection по id и не делает semantic/model-based выбор.

## Role-specific contracts

Специализированные классы не удаляются. Они наследуют общую механику и остаются местом для различий роли: входного контракта, ожидаемого результата, прямых capabilities и разрешённой schema delegation.

```text
StepSchema                 StepMethod
   |                           |
   +-- WorkerSchema            +-- WorkerMethod
   +-- PlannerSchema           +-- PlannerMethod
   +-- ActionSchema            +-- ActionMethod
```

Сейчас `Planner*` привязан только к `STEP.PLAN`. `REPLAN` намеренно не склеивается с Planner автоматически: это отдельный semantic Step, и его границу нужно подтвердить отдельно.

## Action

Action физически перенесён под `Process/Step/Action/`. Старые aliases `@engine/Action/*` и `@engine/Worker/Action/*` временно указывают на новое расположение, поэтому concrete Action implementation можно разбирать постепенно.

`ActionRunner` отличается от default `StepRunner` только role-specific binding: implementation id берётся из обязательного поля `action`, а не из `preset`.

## Что пока не меняется

`Determine`, `Edit`, `EngineTest` и `Research` этим этапом не переосмысляются и не перемещаются. Их границы будут рассматриваться отдельно после того, как Step abstraction проявит реальные требования к capabilities и результатам.

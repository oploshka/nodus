# Step

`src/engine/Step/` — новая schema-driven ветка исполнения semantic Process steps в Nodus 0.5. Она находится на одном уровне с `src/engine/Process/`: Process владеет языком и runtime schema, Step — общей механикой исполнения конкретных semantic roles.

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

## Migration boundary

Новые Worker/Planner contracts и runners живут только под `src/engine/Step/`. Старые `src/engine/Process/Worker/` и `src/engine/Process/Planner/` сохраняют только `Deprecated/` compatibility implementation до её разбора.

Action полностью перенесён в `src/engine/Step/Action/`. Старые aliases `@engine/Action/*` и `@engine/Worker/Action/*` временно указывают на новое расположение.

`Determine`, `Edit`, `EngineTest` и `Research` этим этапом не переосмысляются и не перемещаются.

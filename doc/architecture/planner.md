# Planner

В Nodus 0.5 новый Planner является semantic Process Step role и живёт под `src/engine/Step/Planner/`.

```text
src/engine/Step/Planner/
  Contract/
    PlannerSchema.ts
    PlannerMethod.ts
    PlannerTsType.ts
  PlannerRunner.ts

src/engine/Process/Planner/
  Deprecated/
    Plan.ts
    Planner.ts
    ModelPlanner.ts
    PlannerModule.ts
    PlannerResolver.ts
    PlannerTsType.ts
```

## Current contract

`PlannerSchema` и `PlannerMethod` наследуют общие `ProcessStepSchema` / `ProcessStepMethod`, фиксируют текущую роль `STEP.PLAN` и остаются точкой для Planner-specific input/result/authority.

Общая mechanics selection/execution принадлежит Process через `ProcessStepResolver` и `ProcessStepRunner`; `PlannerRunner` только связывает `STEP.PLAN` с этим primitive. `REPLAN` пока не склеивается с Planner автоматически.

```text
STEP.PLAN
  -> PlannerRunner
  -> ProcessStepRunner
  -> ProcessStepResolver
  -> Planner implementation
       -> SCHEMA -> ProcessRuntime
       -> METHOD -> run(request)
```

## Deprecated

`src/engine/Process/Planner/Deprecated/` хранит старую Planner модель и промежуточный compatibility path. Наличие `qualify/plan/replan` в старом API не задаёт форму нового Process Step contract.

`ModelPlanner` остаётся concrete legacy behavior и является кандидатом на перенос в automation, когда production path начнёт использовать новый Planner role. Остальной legacy слой — старые contracts/mechanics, а не automation implementation.

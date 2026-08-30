# Worker

В Nodus 0.5 новый Worker является semantic Step role и живёт под `src/engine/Step/Worker/`.

```text
src/engine/Step/Worker/
  Contract/
    WorkerSchema.ts
    WorkerMethod.ts
    WorkerTsType.ts
  WorkerRunner.ts

src/engine/Process/Worker/
  Deprecated/
    Worker.ts
    WorkerContext.ts
    WorkerIterativeRunner.ts
    WorkerAgentRunner.ts
```

## Current contract

`WorkerSchema` и `WorkerMethod` наследуют общие `StepSchema` / `StepMethod`, фиксируют `STEP.WORKER` и остаются точкой для Worker-specific input/result/authority.

Общая mechanics selection/execution принадлежит `StepResolver` и `StepRunner`; `WorkerRunner` только связывает semantic `STEP.WORKER` с этим primitive.

```text
STEP.WORKER
  -> WorkerRunner
  -> StepRunner
  -> StepResolver
  -> Worker implementation
       -> SCHEMA -> ProcessRuntime
       -> METHOD -> run(request)
```

## Deprecated

`src/engine/Process/Worker/Deprecated/` содержит старый production Worker contract и механики, завязанные на `Task`, `PlanStep`, `WorkerInstrument`, старые result statuses и retrieval context.

Новые Worker contracts/runners рядом с этим legacy path не дублируются. По мере миграции полезная concrete behavior должна уходить в automation или новый Step path, а оставшийся compatibility code — удаляться.

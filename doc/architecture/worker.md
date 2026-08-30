# Worker

В Nodus 0.5 новый Worker является semantic Process Step role и живёт под `src/engine/Step/Worker/`.

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
    Action/
      Action.ts
      WorkerAction.ts
```

## Current contract

`WorkerSchema` и `WorkerMethod` наследуют общие `ProcessStepSchema` / `ProcessStepMethod`, фиксируют `STEP.WORKER` и остаются точкой для Worker-specific input/result/authority.

Общая mechanics selection/execution принадлежит Process через `ProcessStepResolver` и `ProcessStepRunner`; `WorkerRunner` только связывает semantic `STEP.WORKER` с этим primitive.

```text
STEP.WORKER
  -> WorkerRunner
  -> ProcessStepRunner
  -> ProcessStepResolver
  -> Worker implementation
       -> SCHEMA -> ProcessRuntime
       -> METHOD -> run(request)
```

## Deprecated

`src/engine/Process/Worker/Deprecated/` содержит старый production Worker contract и механики, завязанные на `Task`, `PlanStep`, `WorkerInstrument`, старые result statuses и retrieval context.

Старый `WorkerAction` contract тоже находится здесь. Concrete legacy Actions больше не принадлежат Core и вынесены в `automation/Action/`.

По мере миграции полезная concrete behavior должна уходить в automation или новый Step path, а оставшийся compatibility code — удаляться.

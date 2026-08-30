# Worker

В Nodus 0.5 Worker разделён на automation-facing contract, Core execution adapter и временный legacy compatibility path.

```text
src/engine/Process/Worker/
  Contract/
    WorkerSchema.ts
    WorkerMethod.ts
    WorkerTsType.ts

  WorkerRunner.ts
  WorkerResolver.ts

  Deprecated/
    Worker.ts
    WorkerContext.ts
    WorkerIterativeRunner.ts
    WorkerAgentRunner.ts
```

## Contract

`Contract/` — API, на который должны опираться новые automation Workers. Новый Process-код не должен импортировать `Deprecated/`.

Worker сообщает Core способ исполнения через `getImplementation()`:

- `SCHEMA` — Worker предоставляет локальную Process schema;
- `METHOD` — Worker предоставляет custom `run(request)`.

`WorkerSchema` требует `getId()` + `getSchema()`. `WorkerMethod` требует `getId()` + `run()`.

```text
Worker
  -> getImplementation()
       -> SCHEMA -> schema
       -> METHOD -> method(request)
```

Core остаётся единственным исполнителем schema.

## Runner / Resolver

`WorkerRunner` — adapter `STEP.WORKER -> automation Worker`. Он не является superclass concrete Worker.

`WorkerResolver` выполняет только deterministic selection:

- `step.preset` -> exact Worker id;
- один доступный Worker -> использовать его;
- несколько Workers без `preset` -> error.

Semantic/model-based выбор Worker не спрятан внутрь Resolver и остаётся отдельной будущей границей.

```text
STEP.WORKER
  -> WorkerRunner
  -> WorkerResolver
  -> Worker.getImplementation()
       -> SCHEMA -> ProcessRuntime
       -> METHOD -> custom method
```

## Deprecated

`Deprecated/` содержит старый production Worker contract и механики, которые всё ещё завязаны на `Task`, `PlanStep`, `WorkerInstrument`, `completed/not-completed/failed` и старый retrieval context.

Они сохраняются только для переходного production path. Новая архитектура не должна проектироваться вокруг этих типов и не должна импортировать `Deprecated/`.

Concrete legacy `WorkerCode` / `WorkerDocumentation` пока используют `Deprecated/WorkerIterativeRunner`. Agent compatibility path использует `Deprecated/WorkerAgentRunner`. Это временное состояние, а не новый Worker API.

Следующий schema-driven `WorkerCode` должен строиться от `Contract/`, а не переписывать `WorkerIterativeRunner` строка-в-строку.

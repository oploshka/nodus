# Worker

В Nodus 0.5 Worker разделён на Core-механику и конкретный versioned automation module.

Core хранит контракт в `src/engine/Process/Worker/`, а конкретные `WorkerCode`, `WorkerDocumentation` и `WorkerAgent` живут в `automation/Worker/`. Это отделяет вопрос «что такое Worker и как Core его исполняет» от пользовательской конфигурации конкретного Worker.

## Process Worker contract

Automation Worker сообщает Core способ исполнения через `getImplementation()`.

Поддерживаются два варианта:

- `SCHEMA` — Worker возвращает локальную Process schema; Core сам исполняет её;
- `METHOD` — Worker предоставляет custom `run(request)` для поведения, которое пока удобнее выразить кодом.

`WorkerSchema` — abstract base для schema-driven Worker и требует `getId()` + `getSchema()`.

`WorkerMethod` — abstract base для custom Worker и требует `getId()` + `run()`.

`WorkerRunner` не является родителем конкретных Workers. Это adapter `STEP.WORKER -> automation Worker`: он собирает `task/context`, читает implementation type и либо возвращает `MODULE_RESULT.SCHEMA` в `ProcessRuntime`, либо вызывает method.

```text
STEP.WORKER
  -> WorkerRunner
  -> Worker.getImplementation()
       -> SCHEMA -> ProcessRuntime executes schema
       -> METHOD -> custom run(request)
```

## Текущий compatibility path

Миграция production Engine на новый Process contract ещё не завершена целиком. Существующий code/documentation execution пока использует Core `IterativeWorker`, но concrete классы уже вынесены в `automation/Worker/`.

Agent-specific bounded loop извлечён из concrete Worker в Core `WorkerAgentRunner`; `automation/WorkerAgent` оставляет только идентичность и подключение этого механизма.

Для code/documentation текущий iterative flow по-прежнему использует:

- `ChangeCodeAction` — semantic edit intent;
- `FindFileAction` / `ReadFileAction` — дешёвый retrieval;
- `ResearchAction` — bounded project research;
- Engine-owned Edit — task-local чтение, накопление и применение изменений.

`WorkerCode` планируется переводить на schema-driven форму отдельно, когда будет зафиксирована полезная Worker schema; сам факт наличия `WorkerSchema` не является причиной преждевременно переписывать iterative lifecycle.

Technical EditStrategy и applicators принадлежат Engine Edit layer. Подробности: [`edit.md`](edit.md).

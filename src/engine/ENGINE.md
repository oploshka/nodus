# Engine

`Engine.run()` coordinates one task run. It owns the original `Task`, the global `Plan` and the list of available `Worker` options for that run.

For each `PlanStep`, Engine selects a compatible Worker and gives that Worker control of the step. Engine does not care how the Worker reaches its result; it reacts only to the returned `WorkerResult` status.

`Determine` is an atomic Engine service used to choose the best option from a bounded list. Engine currently uses it to choose between compatible Workers, but the service itself is not Worker-specific. A single available option is returned without a model call.

`Research` is an atomic Engine service, not a Worker type. A Worker may call Research while trying to complete its own task; the internal attempt/research/retry loop stays inside that Worker.

Only `completed` advances the global Plan. `not-completed` means the current Worker stopped with meaningful state and may be continued, reconsidered or replaced later. `failed` means the current execution path is terminal.

## Execution samples

Engine logs one structured `engine.execution.sample` event per Worker execution. It contains the original task, current PlanStep, candidate workers, selected worker, result and duration. The event is intentionally storage-agnostic for now; later it can feed task clustering, Worker success statistics and better Determine decisions.

Engine is also the natural control boundary between Worker execution and external/user interaction. A Worker owns local autonomy for one assigned task; Engine owns whether execution continues, changes Worker, pauses, or returns control outside. The concrete interaction protocol is intentionally not fixed yet.

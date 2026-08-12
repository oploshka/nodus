# Worker

A `Worker` is an Engine execution option for one `PlanStep`.

The Engine-facing contract is intentionally small: `id`, `description`, `canHandle(step)` and `run(task, step) -> WorkerResult`. `WorkerResult` exposes only orchestration statuses: `completed`, `needs-subtask`, `blocked`, or `failed`. Engine does not inspect Worker internals.

`DefaultWorker` is currently the only implementation. It keeps the existing bounded local loop with `ExecutionPlanner`, `ExecutionState` and registered `ExecutionAction` capabilities (`research`, `edit-file`). This internal design is temporary and can evolve without changing the Engine/Worker boundary.


Worker selection is isolated behind `WorkerSelector`. The current `FirstMatchWorkerSelector` is deterministic and intentionally temporary; richer routing can replace it without changing the Engine/Worker boundary.

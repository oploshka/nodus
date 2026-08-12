# Engine

`Engine.run()` coordinates one task run. It owns the original `Task`, the global `Plan` and the list of available `Worker` options for that run.

For each `PlanStep`, Engine selects a compatible Worker and gives that Worker control of the step. Engine does not care how the Worker reaches its result; it reacts only to the returned `WorkerResult` status.

Current routing is intentionally minimal and deterministic: the first registered Worker whose `canHandle(step)` returns `true` is selected. This is a placeholder for a richer routing decision once more than one real Worker exists.

`Research` remains an Engine service, not a Worker type. A Worker may use Research internally, or later ask Engine/Planner for a new subtask when its current step cannot proceed with the available knowledge.


Engine owns the global run loop and treats Workers as available execution options. Worker routing is delegated to `WorkerSelector`; only a `completed` Worker result advances to the next PlanStep. Other statuses are preserved for later recovery/subtask orchestration.

# Engine

`Engine.run()` coordinates one task run. It owns the original `Task`, the global `Plan` and the list of available `Worker` options for that run.

For each `PlanStep`, Engine selects a compatible Worker and gives that Worker control of the step. Engine does not care how the Worker reaches its result; it reacts only to the returned `WorkerResult` status.

`Determine` is an atomic Engine service used to choose the best option from a bounded list. Engine currently uses it to choose between compatible Workers, but the service itself is not Worker-specific. A single available option is returned without a model call.

`Research` remains an Engine service, not a Worker type. A Worker may use Research internally, or later ask Engine/Planner for a new subtask when its current step cannot proceed with the available knowledge.


Engine owns the global run loop and treats Workers as available execution options. Only a `completed` Worker result advances to the next PlanStep. Other statuses are preserved for later recovery/subtask orchestration.

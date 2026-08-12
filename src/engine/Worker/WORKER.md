# Worker

A `Worker` is an Engine execution option for one `PlanStep`.

Engine sees only `id`, `description`, `canHandle(step)` and `run(task, step) -> WorkerResult`. It does not inspect the Worker's local execution loop or knowledge.

`WorkerResult` has three orchestration outcomes:

- `completed` — the assigned task is complete;
- `not-completed` — this Worker stopped without completing the task, but it can be called again and may keep useful internal knowledge;
- `failed` — this execution path is terminal for the Worker in the current context.

## Local lifecycle

A Worker starts by attempting the task, not by researching it pre-emptively:

```text
attempt task
-> completed / failed
-> missing information
   -> bounded Research for concrete questions
   -> attempt the same task again with accumulated knowledge
```

The loop is bounded. Reaching the attempt or research budget returns `not-completed`, not `failed`.

`WorkerAttempt` is the internal contract for one bounded execution attempt. `missing-information` never reaches Engine; it is consumed by the Worker lifecycle. An attempt may also return `not-completed` when its local execution/recovery budget is exhausted; the Worker forwards that state without re-planning the whole task automatically.

## Edit recovery

A project-change attempt keeps a successful `ready` proposal while applying its edits. A failed patch is repaired locally against the current authoritative file instead of restarting the whole Worker attempt:

```text
ready edits
-> apply edit A
-> apply edit B fails
   -> reread current B
   -> regenerate only B diff
   -> retry B
-> continue remaining edits
```

This matters because earlier edits may already have changed the project. Re-running the complete proposal after one patch failure would mix old assumptions with a partially modified working tree. Local edit recovery is bounded; exhausting it returns `not-completed` with `canContinue: true`.

## Current workers

- `CodeWorker` — source code, runtime behavior, configuration, and project logic changes.
- `DocumentationWorker` — README/documentation/example/explanatory text changes.
- `AgentWorker` — bounded general-purpose model/tool agent loop; useful as a broad execution option when a specialized worker is not a clear fit.

There is intentionally no `DefaultWorker`. Workers are Engine options; `Determine` chooses the best option for the current `PlanStep`.

`AgentWorker` is intentionally different from `IterativeWorker`: it gives a model bounded direct access to project tools and owns an agent loop. This keeps the raw-agent strategy available without turning Engine itself into an agent.


## Research boundary

A Worker always attempts execution first. Research is invoked only when the attempt returns `missing-information` with concrete blocking questions. `Research.ask(question)` first checks its cache; cached answers are reusable only while hashes of all source files still match. A stale entry is discarded and resolved again. The Worker does not proactively research before its first attempt.

# Worker

Worker executes one `PlanStep` and hides its local execution process from Engine.

Engine only sees the final `WorkerResult`:

- `completed` — the PlanStep outcome was achieved;
- `not-completed` — the current run stopped, but the same Worker instance may still be useful;
- `failed` — the Worker considers this execution path terminal.

## Actions

A Worker owns an explicit bounded set of executable Actions. An Action is a capability with a concrete input/output contract, not a prompt description.

The current `CodeWorker` starts with `change-code`. If that Action cannot execute safely because concrete project facts are missing, it explicitly requests `research`. The Worker runs only those requested Research actions and then retries the same change.

Current shape:

```text
CodeWorker
  change-code
  research
```

`ChangeCodeAction` may update multiple project-root-relative files when all edits belong to one coherent outcome. Diff generation, patch application and local edit recovery belong to that Action.

Action-specific model guidance lives with the Action. Actions may override model/settings per call (`model`, `temperature`, `maxTokens`), while provider transport remains hidden behind `ModelRunner` / `ModelCaller`.

Research is never run pre-emptively by the Worker. It is invoked only after the primary Action explicitly says which bounded project facts are required. `Research` itself owns cache lookup and source-hash invalidation.

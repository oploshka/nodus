# Worker

`DefaultWorker` attempts to execute exactly one semantic `PlanStep`.

It aggregates three things:

- `ExecutionPlanner` — chooses the next local execution step;
- `ExecutionState` — records what has happened during this Worker run;
- registered `ExecutionAction` instances — the only capabilities available to the local planner.

The Worker owns the bounded loop. `ExecutionPlanner` does not execute actions and
an action does not choose what happens after itself.

## Incremental execution planning

Execution planning is intentionally incremental rather than a full static action
list. A later action often depends on data produced by an earlier action.

For `/status` the practical flow is:

```text
PlanStep
→ nextStep: research(question about CLI/current state access)
→ ResearchAction result is added to ExecutionState.history
→ nextStep: edit-file(path + focused instruction based on known research)
→ EditFileAction result is added to history
→ nextStep: completed
```

This is still planning: every `nextStep()` call chooses one action-level step from
the current state. It simply avoids pretending that the complete action inputs are
known before research has run.

## Action boundary

An `ExecutionAction` is a capability available to the Worker. In the current spike:

- `research` answers one bounded project question;
- `edit-file` performs one focused edit to one known file.

`edit-file` intentionally keeps diff generation, diff parsing/apply, and file write
inside one action for now. Those are mechanics of one focused edit, not proven
high-level actions for ExecutionPlanner.

The action id list is part of the model response schema. The model therefore cannot
successfully return an action that this Worker did not register.

## Bounds

Worker enforces `maxIterations` and each action may expose `maxUses`. These limits
are runtime policy independent of model judgment, preventing an unbounded local
agent loop such as repeated research.

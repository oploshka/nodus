# Planner

Planner is the high-level task planner of the Engine.

Its job is deliberately narrow: turn the user `Task` into a small semantic `Plan`.
A `PlanStep` says **what outcome should be achieved**, not how to implement it.

For example, for `/status` Planner may produce one step:

```text
goal: add /status with the requested observable behavior
constraints:
- use existing project state
- do not scan/refresh only to display status
- do not change unrelated behavior
```

Planner should not need to know that the implementation lives in `Cli.ts`, that
`ProjectSession.index` exists, or that a unified diff will be used. Those are
execution/research concerns.

## Limited knowledge during planning

Planner may later be allowed to request a small bounded piece of project knowledge
when it is genuinely necessary to choose the semantic decomposition itself. This
must not turn Planner into implementation research. It should not walk the project
until it can solve a step or discover concrete APIs for Worker.

## Knowledge impact

`PlanStep.knowledgeImpact` is an optional invalidation hint: knowledge that may
become stale after the step changes the project. It does not instruct Worker to
research that knowledge before execution.

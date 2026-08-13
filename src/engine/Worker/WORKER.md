# Worker

Worker owns the bounded execution process for one `PlanStep`. Engine selects a Worker and sees only its final `completed | not-completed | failed` result; the internal Action sequence belongs to the Worker.

## Actions

Actions are executable capabilities, not descriptions that Engine converts into model calls. An Action may use `ModelCaller`, Project, Research or other engine/model services internally and returns the common `ActionResult` contract.

Current `CodeWorker` intentionally tests one primary editing strategy:

- `change-code-range-replace` — primary small-range replace experiment;
- `research` — invoked only when the primary Action explicitly reports missing project facts.

Alternative code-changing Actions exist but are not selected by `CodeWorker` yet:

- `ChangeCodeReplaceAction` — previous large `before -> after` exact-replace experiment, retained for comparison;
- `ChangeCodeDiffAction` — unified-diff strategy;
- `ChangeCodeEditAction` — complete resulting-file strategy, now implemented on the same buffered change-set lifecycle.

This is deliberate. We first want runtime evidence for the smaller replace contract before adding Action routing/fallback logic.

## Buffered change-set lifecycle

A code-changing Action never writes one model edit immediately. The shared `ChangeCodeAction` lifecycle prepares the complete coherent change in memory first:

```text
model decision -> edits[]
  -> resolve/read authoritative files
  -> prepare resulting contents in memory
  -> validate every write target
  -> commit changed files
```

If any strategy/model/applicator error occurs while preparing an edit, no project file is written. Multiple edits targeting the same file are applied to the buffered `current` content in order. During commit, all targets have already been resolved; a filesystem write failure triggers a best-effort rollback of files written earlier in that commit.

## Small-range replace strategy

`ChangeCodeRangeReplaceAction` asks the model to repeat only the small range actually being changed:

```ts
{
  startLine: 35,
  endLine: 35,
  expected: '    private readonly maxPlanSteps = 8,',
  replacement: '    private readonly maxPlanSteps = runtime.maxPlanSteps ?? 8,',
}
```

`startLine/endLine` are hints. `expected` is the guard. The applicator first checks the hinted range, then a small local window, then the complete file only if there is one unique exact match. Ambiguous or missing guards fail instead of being guessed. All operations for one file are resolved against one buffered source snapshot and applied bottom-up.

For insertion the model replaces one stable existing line with that same line plus inserted content. This avoids asking a small model to reproduce a large surrounding constructor/class/function merely as replace context.

## Full-file Edit strategy

`ChangeCodeEditAction` asks for the complete resulting content of exactly one authoritative file. It preserves the source EOL convention and returns the resulting content to the shared buffered change-set lifecycle; it does not write directly. This makes it usable later as a higher-context fallback when range replace cannot express an edit reliably.

## Research lifecycle

Research is not speculative preprocessing. The primary Action starts by attempting the task. Only a `not-completed` result containing explicit `research` requests causes the Worker to run `ResearchAction`; answers are added to the Worker session and the primary Action is retried. A Research request keeps intent and location separate: `question` says what fact is needed, while optional `targets` names known project-root-relative files to inspect first.

Research itself owns cache lookup and source-hash invalidation.

## Paths

Model-facing project paths are canonical project-root-relative paths. `ProjectPathResolver` may normalize dirty or absolute in-project representations and may repair an incorrect prefix only when the project index gives one unambiguous existing match. Write policy blocks protected/ignored project targets according to the current Project rules.

# Worker

Worker owns the bounded execution process for one `PlanStep`. Engine selects a Worker and sees only its final `completed | not-completed | failed` result; the internal Action sequence belongs to the Worker.

## Actions

Actions are executable capabilities, not descriptions that Engine converts into model calls. An Action may use `ModelCaller`, Project, Research or other engine/model services internally and returns the common `ActionResult` contract.

Current `CodeWorker` intentionally tests one primary editing strategy:

- `change-code-replace` — primary experimental code-change Action;
- `research` — invoked only when the primary Action explicitly reports missing project facts.

Two alternative code-changing Actions also exist but are not selected by `CodeWorker` yet:

- `ChangeCodeDiffAction` — unified-diff strategy kept for comparison;
- `ChangeCodeEditAction` — complete resulting-file strategy for a more expensive/high-context fallback.

This is deliberate. We want runtime evidence for replace before adding Action routing/fallback logic.

## Replace strategy

`ChangeCodeReplaceAction` first prepares one coherent change and may touch multiple files when they are required for the same outcome. For each file it asks for guarded operations:

```ts
{
  line: 35,      // 1-based location hint only
  before: '...', // exact text from current authoritative source
  after: '...',  // complete replacement text
}
```

`before` is authoritative; `line` only helps localize the match. All operations for a file are resolved against the same current source snapshot and applied bottom-up. Missing, ambiguous or overlapping matches fail instead of being guessed. One local regeneration is allowed against the latest authoritative file.

Insertions can be represented by replacing a stable anchor with `anchor + inserted content`; deletion uses an empty `after`.

## Research lifecycle

Research is not speculative preprocessing. The primary Action starts by attempting the task. Only a `not-completed` result containing explicit `research` requests causes the Worker to run `ResearchAction`; answers are added to the Worker session and the primary Action is retried.

Research itself owns cache lookup and source-hash invalidation.

## Paths

Model-facing project paths are canonical project-root-relative paths. `ProjectPathResolver` may normalize dirty or absolute in-project representations and may repair an incorrect prefix only when the project index gives one unambiguous existing match. Write policy blocks protected/ignored project targets according to the current Project rules.

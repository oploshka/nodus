# Benchmark: `/status` and non-obvious API access

## Task

Add `/status` to the CLI. It must print the current project ID, current conversation ID, and number of files in the already available project index. Reuse existing APIs/structures, do not scan/refresh merely to answer `/status`, and make no unrelated changes.

## Raw-agent observations

The same local model was run as a simple coding agent with project tools and without the Nodus requirement/evidence pipeline.

1. One run used the plausible but nonexistent `nodus.projectSession.getIndex()`. `tsc --noEmit` failed because `ProjectSession` has no `getIndex`.
2. Later runs produced `nodus.projectSession.index`, matching the then-current API.
3. The real field was deliberately renamed from `index` to the non-obvious `currentIndexMy`.
4. After the rename, the raw agent again generated `nodus.projectSession.getIndex()` instead of locating the renamed API.

The important observation is not the wrong spelling. The agent could produce correct and incorrect implementations while using a shallow process that did not establish the actual `ProjectSession` access contract before editing.

## What this demonstrates

A raw agent may substitute a **probable API shape** for a **verified project fact**.

This is the behavior the Nodus retrieval contract is intended to control:

```text
requirement
    ↓
exact evidence? ── yes → grounded fact
    │
    no
    ↓
related evidence is context only
    ↓
missing requirement resolution
    ↓
recheck original requirement
```

`related` evidence must not satisfy the evidence requirement, and successful child work must not automatically mark the parent requirement complete.

## Current conclusion

This experiment supports a narrow claim:

> For project-specific API access, a raw agent can produce a correct result by inference while using essentially the same process that can also hallucinate a nonexistent API.

It does **not** prove that Nodus is globally more reliable, faster, or cheaper. Broader benchmark coverage is required.

## Future variants

Useful distinct follow-ups include a misleading related API near the target, a read-only requirement with an obvious mutating alternative, larger project/context size with a small required fact, and verification/recovery after an API rename.

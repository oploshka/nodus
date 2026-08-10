# Retrieval and requirement resolution

Search is responsible for locating evidence, not interpreting project architecture.

## Retrieval outcomes

A typed evidence search ends in one of three states:

```text
exact    the exact retrieval tier returned concrete project evidence
related  broader retrieval found something relevant, but the requirement is not satisfied
missing  neither exact nor related retrieval found useful project evidence
```

`related` is deliberately **not success**.

```text
requirement
    ↓
retrieval
 ┌──┼───────┐
exact related missing
 │      │      │
 ▼      └──┬───┘
store      ↓
        requirement resolution
```

Only `exact` creates the required `evidence:*` fact in `ExecutionContext`.

## Deterministic retrieval

For typed evidence requirements Nodus compiles tool calls from:

```text
active action
+ typed output key
+ source hints
+ optional lexical model fallback
```

The model does not generate raw tool-call field names. Nodus owns tool selection, canonical input fields, paths, and limits.

Search attempts are semantic attempts. Internal exact/related retrieval rounds do not consume additional semantic attempts.

## Related evidence

Related evidence is retained as context for diagnosis/resolution but does not close the postcondition.

Example:

```text
Requirement:
  read current already-available ProjectIndex

Related candidate:
  ProjectSession.scan()

Result:
  related / constraint-violating context
  requirement remains missing
```

Semantic constraints are checked again by `understand`; a side-effecting path cannot become a read-only fact merely because it is related.

## Missing requirement child plans

When a typed requirement remains unresolved, `RequirementResolutionPlanner` plans **only that requirement**.

```text
parent step
  └─ missing requirement X
        ↓
RequirementResolutionPlanner
        ↓
  ┌─────┴──────────────────┐
  │                        │
knowledge child       capability-addition child
root = X              root = supporting change-definition
  │                        │
compileResolution     compileCapabilityResolution
  └──────────┬─────────────┘
             ↓
        execute child
             ↓
        recheck X in parent
```

The child planner returns requirements, not execution steps. The deterministic `PlanCompiler` builds the child steps.

Current guards:

- Knowledge child map root must exactly equal the missing requirement; capability-addition uses a supporting `change-definition` root and carries the original requirement as `recheck`.
- Parent constraints are preserved; the child planner cannot weaken them.
- Related evidence is context only.
- Child maps are capped at six entries.
- Resolution depth is capped at two.
- Automatic resolution attempts are capped at two per requirement.
- Knowledge-resolution compilation does not add `finalize` and does not apply code changes.
- Capability-addition compilation may apply exactly the supporting change represented by its child map, but still does not add `finalize`.
- Paths are restricted to current project-index candidates.


## Capability-addition branch

A missing requirement is not automatically proof that a project capability is absent. Normal knowledge resolution is preferred first. When grounded retrieval/evidence indicates that the required capability truly does not exist, the resolution planner may return a bounded `capability-addition` child map.

```text
missing requirement X
        ↓
resolution planner
  ├─ knowledge child plan
  ├─ capability-addition child plan
  │      evidence → fact → supporting change-definition → edit-file
  └─ unresolvable
        ↓
original requirement X is still missing
        ↓
rerun/recheck X against the changed project
```

The supporting change must use an existing project target, preserve the original semantic constraints, and gains the additional `minimal-supporting-change` constraint. The child edit itself never satisfies `X`; only a later exact retrieval/fact postcondition can do that.

This is intentionally bounded recursion, not free-form replanning: resolution depth and attempts remain capped, and the parent task graph is not replaced.

## Parent recheck

Running a child plan does **not** automatically satisfy the parent.

For an output requirement, the parent is skipped only after the exact output exists in `ExecutionContext`. For a missing input requirement, the parent runs again after the input becomes available. This preserves the original postcondition instead of treating “a child plan ran” as success.

## Generic recovery

The older `RecoveryController` remains as a bounded fallback for non-requirement failures, protocol/tool failures, or cases the requirement-resolution path cannot handle. Missing typed requirements are routed to requirement resolution first.

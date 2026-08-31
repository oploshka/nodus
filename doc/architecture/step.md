# Step

`src/engine/Step/` is the active convenience layer for Nodus-owned semantic module groups. It is not an execution runtime.

Core owns module lookup, context projection, `SEQUENCE`, transitions and `OUTPUT | SCHEMA` execution. Step classes only provide small reusable contracts for built-in roles. User modules do not need to inherit them; matching the Core module shape is enough.

## Active contracts

```text
src/engine/Step/
  Planner/Contract/
    PlannerMethod.ts
    PlannerSchema.ts
    PlannerTsType.ts
  Worker/Contract/
    WorkerMethod.ts
    WorkerSchema.ts
    WorkerTsType.ts
  Qualifier/Contract/
  Research/Contract/
  Action/Contract/
  Determine/README.md
```

`*Method` wraps an imperative `run()` result as Core `OUTPUT`. `*Schema` wraps `getSchema()` as Core `SCHEMA`. Each base class supplies only its group name and the structural Core adapter.

There are deliberately no role-specific runners. A `WorkerRunner`, `PlannerRunner` or equivalent would duplicate Core execution mechanics.

`*TsType` files are intentionally thin extension points today. Role-specific request/output/schema types should only grow when a real semantic difference appears.

## Determine

`Determine` is not active as a separate group. Its previous bounded option-selection contract is preserved under `src/engine/Deprecated/Determine/`; the active `Step/Determine/README.md` records that the responsibility is currently treated as qualification/classification.

## Preserved prototype

The earlier fixed-`STEP` implementation remains under:

```text
src/engine/Deprecated/Process/
src/engine/Deprecated/Step/
```

Those files preserve the old `STEP` enum, `ProcessStepRunner`, role runners and related contracts as migration history. New Core and active Step code must not depend on them.

See `doc/architecture/core.md` for the Engine/Core boundary.

# Process Step prototype

The first Nodus 0.5 schema prototype modeled semantic roles through a fixed `STEP` enum and role-specific runners. That implementation is now preserved under `src/engine/Deprecated/Process/` and `src/engine/Deprecated/Step/`; it is no longer the intended configuration boundary of the Engine Core.

## Current direction

The new Core owns only structural orchestration. `SEQUENCE` remains a reserved Core primitive, while semantic execution groups are declared by Engine initialization config.

A schema step names a registered module rather than selecting from a fixed semantic enum. Group authority is configured separately from module implementations and Core validates returned schemas against those policies.

## Preserved prototype

The previous fixed-role implementation remains available only as deprecated migration history:

```text
src/engine/Deprecated/Process/
  ProcessRuntime.ts
  ProcessSchema.ts
  ProcessStepMethod.ts
  ProcessStepSchema.ts
  ProcessStepRunner.ts
  ProcessStepResolver.ts
  ...

src/engine/Deprecated/Step/
  Worker/
  Planner/
  Qualifier/
  Determine/
  Research/
  Action/
```

The compatibility aliases continue to resolve these deprecated paths while active Core code does not depend on them.

See `doc/architecture/core.md` for the current Engine/Core boundary.

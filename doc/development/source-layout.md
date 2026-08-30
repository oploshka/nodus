# Project source layout

This file fixes the source-layout conventions used by Nodus engine code.

## Entity directories

A directory that represents an engine domain owns its files. Do not place files for that entity next to its directory at the parent level.

```text
src/engine/Process/
  Process/
  Worker/
  Planner/
  Action/
```

For example, `ProcessRuntime.ts` belongs in `Process/Process/`, not next to the `Worker/` and `Planner/` directories.

## File names

Files owned by an entity start with that entity name.

```text
WorkerRunner.ts
WorkerResolver.ts
WorkerSchema.ts
PlannerRunner.ts
PlannerResolver.ts
PlannerMethod.ts
ActionReadFile.ts
ProcessRuntime.ts
```

Avoid reversed names such as `CodeWorker.ts`, `ModelPlanner.ts`, or `ReadFileAction.ts` in new code.

The existing lowercase type prefixes remain unchanged inside TypeScript: `s` for structural interfaces, `i` for behavioral interfaces, `t` for derived types, and `p` for primitive aliases.

When supporting TypeScript contracts would clutter an implementation file, place them in `<Entity>TsType.ts`.

## Contract directories

When an entity exposes a small family of automation-facing contracts, keep that family in the entity-local `Contract/` directory.

```text
Worker/
  Contract/
    WorkerSchema.ts
    WorkerMethod.ts
    WorkerTsType.ts
  WorkerRunner.ts
  WorkerResolver.ts

Planner/
  Contract/
    PlannerSchema.ts
    PlannerMethod.ts
    PlannerTsType.ts
  PlannerRunner.ts
  PlannerResolver.ts
```

`Contract/` is not a generic dumping ground for interfaces. It is used when the files together define the external implementation boundary of the entity. Runtime execution mechanics remain at the entity root.

## Deprecated directories

During an architectural migration, incompatible legacy implementations may be quarantined under the owning entity's `Deprecated/` directory instead of distorting the new contract.

New Process code must not import `Deprecated/`. The directory is a temporary compatibility/history boundary, not a supported extension surface. When the old production path is removed, its deprecated files should be deleted rather than promoted back into the current entity root.

## Entity-local helpers

Helpers that are implementation details of one entity live under that entity's `Kit/` directory and keep the entity prefix.

```text
Process/
  Kit/
    ProcessStepRef.ts
```

Do not promote entity-local helpers to the aggregate `Process/` root.

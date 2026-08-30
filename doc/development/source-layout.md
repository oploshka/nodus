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
WorkerCode.ts
WorkerRunner.ts
WorkerSchema.ts
PlannerModel.ts
ActionReadFile.ts
ProcessRuntime.ts
```

Avoid reversed names such as `CodeWorker.ts`, `ModelPlanner.ts`, or `ReadFileAction.ts`.

The existing lowercase type prefixes remain unchanged inside TypeScript: `s` for structural interfaces, `i` for behavioral interfaces, `t` for derived types, and `p` for primitive aliases.

When supporting TypeScript contracts would clutter an implementation file, place them in `<Entity>TsType.ts`.

## Entity-local helpers

Helpers that are implementation details of one entity live under that entity's `Kit/` directory and keep the entity prefix.

```text
Process/
  Kit/
    ProcessStepRef.ts
```

Do not promote entity-local helpers to the aggregate `Process/` root.

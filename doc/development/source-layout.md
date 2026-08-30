# Project source layout

This file fixes the source-layout conventions used by Nodus engine code.

## Entity directories

A directory that represents an engine domain owns its files. Do not place files for that entity next to its directory at the parent level.

The schema-driven Process path groups semantic executable roles under `Step/`:

```text
src/engine/Process/
  Process/
  Step/
    Contract/
    Worker/
    Planner/
    Action/
```

Existing top-level `Worker/`, `Planner/` and other Process directories may remain during migration. New Step architecture is developed under `Step/` instead of reshaping those directories in place.

For example, `ProcessRuntime.ts` belongs in `Process/Process/`; shared Step execution belongs in `Process/Step/`; WORKER-specific Step contracts belong in `Process/Step/Worker/`.

## File names

Files owned by an entity start with that entity name.

```text
StepRunner.ts
StepResolver.ts
WorkerSchema.ts
PlannerMethod.ts
ActionRunner.ts
ProcessRuntime.ts
```

Avoid reversed names such as `CodeWorker.ts`, `ModelPlanner.ts`, or `ReadFileAction.ts` in new code.

The existing lowercase type prefixes remain unchanged inside TypeScript: `s` for structural interfaces, `i` for behavioral interfaces, `t` for derived types, and `p` for primitive aliases.

When supporting TypeScript contracts would clutter an implementation file, place them in `<Entity>TsType.ts`.

## Contract directories

When an entity exposes a small family of automation-facing contracts, keep that family in the entity-local `Contract/` directory.

```text
Step/
  Contract/
    StepSchema.ts
    StepMethod.ts
    StepTsType.ts
  StepRunner.ts
  StepResolver.ts

  Worker/
    Contract/
      WorkerSchema.ts
      WorkerMethod.ts
      WorkerTsType.ts
    WorkerRunner.ts

  Planner/
    Contract/
      PlannerSchema.ts
      PlannerMethod.ts
      PlannerTsType.ts
    PlannerRunner.ts
```

`Contract/` is not a generic dumping ground for interfaces. Shared execution mechanics belong to `Step/Contract`; role-specific contracts extend them under the semantic Step role so input, result and authority can diverge without duplicating execution mechanics.

## Deprecated directories

During an architectural migration, incompatible legacy implementations may be quarantined under the owning entity's `Deprecated/` directory instead of distorting the new contract.

New Step code must not import `Deprecated/`. Existing legacy paths may continue to do so until their behavior is either moved into automation/current Step roles or deleted.

## Entity-local helpers

Helpers that are implementation details of one entity live under that entity's `Kit/` directory and keep the entity prefix.

```text
Process/
  Kit/
    ProcessStepRef.ts
```

Do not promote entity-local helpers to the aggregate `Process/` root.

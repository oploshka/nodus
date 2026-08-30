# Project source layout

This file fixes the source-layout conventions used by Nodus engine code.

## Entity directories

A directory that represents an engine domain owns its files. Do not place files for that entity next to its directory at the parent level.

Schema-driven Process execution is split between two sibling engine entities:

```text
src/engine/
  Process/
    Process/
    Worker/
      Deprecated/
    Planner/
      Deprecated/
    Determine/
    Edit/
    EngineTest/
    Research/

  Step/
    Contract/
    Worker/
    Planner/
    Action/
```

`Process/` owns the Process language/runtime and still contains untouched legacy/capability directories during migration. `Step/` owns the new shared execution primitive and current semantic Step contracts.

For example, `ProcessRuntime.ts` belongs in `Process/Process/`; shared Step execution belongs in `Step/`; WORKER-specific Step contracts belong in `Step/Worker/`.

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

During migration, the old production Worker/Planner implementation remains quarantined under:

```text
src/engine/Process/Worker/Deprecated/
src/engine/Process/Planner/Deprecated/
```

New Step code must not import these directories. Current Step contracts/runners must not be duplicated beside Deprecated code under `Process/Worker` or `Process/Planner`.

## Entity-local helpers

Helpers that are implementation details of one entity live under that entity's `Kit/` directory and keep the entity prefix.

```text
Process/
  Process/
    Kit/
      ProcessStepRef.ts
```

Do not promote entity-local helpers to an unrelated aggregate root.

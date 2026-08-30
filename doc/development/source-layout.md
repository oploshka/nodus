# Project source layout

This file fixes the source-layout conventions used by Nodus engine code.

## Entity directories

A directory that represents an engine domain owns its files. Do not place files for that entity next to its directory at the parent level.

Process owns the generic execution primitive for one semantic step:

```text
src/engine/Process/
  Process/
    ProcessRuntime.ts
    ProcessStepSchema.ts
    ProcessStepMethod.ts
    ProcessStepTsType.ts
    ProcessStepRunner.ts
    ProcessStepResolver.ts
```

Role-specific Process Step contracts live separately:

```text
src/engine/Step/
  Worker/
  Planner/
  Qualifier/
  Action/
```

`Step/` is a semantic-role grouping, not the owner of shared execution mechanics. The folder name may evolve; the stable boundary is `ProcessStep*` in Process versus role-specific extension surfaces.

## File names

Files owned by an entity start with that entity name.

```text
ProcessStepRunner.ts
ProcessStepResolver.ts
WorkerSchema.ts
PlannerMethod.ts
QualifierRunner.ts
ActionRunner.ts
ProcessRuntime.ts
```

Avoid reversed names such as `CodeWorker.ts`, `ModelPlanner.ts`, or `ReadFileAction.ts` in new Core code. Existing legacy/automation files may keep historical names during migration.

The existing lowercase type prefixes remain unchanged inside TypeScript: `s` for structural interfaces, `i` for behavioral interfaces, `t` for derived types, and `p` for primitive aliases.

When supporting TypeScript contracts would clutter an implementation file, place them in `<Entity>TsType.ts`.

## Contract directories

Role-specific automation-facing contract families stay in the role-local `Contract/` directory:

```text
Step/
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

  Qualifier/
    Contract/
      QualifierSchema.ts
      QualifierMethod.ts
      QualifierTsType.ts
    QualifierRunner.ts
```

Generic Process Step mechanics do not need a separate `Contract/` directory: the `ProcessStep*` prefix makes their ownership explicit inside the Process entity.

## Automation ownership

Concrete executable behavior belongs in `automation/` when it is a replaceable user/versioned implementation of a Core contract. For example, Core owns the Action role contract while concrete Actions live under `automation/Action/`.

## Deprecated directories

During an architectural migration, incompatible legacy implementations may be quarantined under the owning entity's `Deprecated/` directory instead of distorting the new contract.

New Process Step code must not import `Deprecated/`. Existing legacy paths may continue to do so until their behavior is either moved into automation/current Step roles or deleted.

## Entity-local helpers

Helpers that are implementation details of one entity live under that entity's `Kit/` directory and keep the entity prefix.

```text
Process/
  Kit/
    ProcessStepRef.ts
```

Do not promote entity-local helpers to the aggregate `Process/` root.

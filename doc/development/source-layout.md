# Project source layout

This file fixes the source-layout conventions used by Nodus engine code.

## Core

The current Engine orchestration kernel is intentionally compact:

```text
src/engine/
  Engine.ts
  Core/
    CoreRuntime.ts
    CoreSchema.ts
    CoreTsType.ts

  Deprecated/
    EngineOld.ts
    Process/
    Step/
    Planner/
    EngineTest/
    Task/
```

`Engine.ts` is the public facade. `Core/` owns only generic orchestration mechanics: module registration, group policy, `SEQUENCE`, explicit context projection, transitions and `OUTPUT | SCHEMA` execution.

Semantic groups such as Planner, Worker, Research, Action or Test are not directories required by Core and are not a fixed Core enum. Their names and authority come from initialization config.

The earlier fixed-`STEP` schema runtime is preserved under `Deprecated/Process/` and `Deprecated/Step/`. The old Plan/Planner contracts, Engine-owned test lifecycle and Task/TaskRun model are also preserved under `Deprecated/`. New Core code must not depend on them.

## Entity directories

A directory that represents an engine domain owns its files. Avoid spreading one mechanism across unrelated parent directories.

Files owned by an entity start with the entity name when that prefix adds useful ownership information:

```text
CoreRuntime.ts
CoreSchema.ts
CoreTsType.ts
WorkerSchema.ts
PlannerMethod.ts
```

The lowercase type prefixes remain unchanged inside TypeScript: `s` for structural interfaces, `i` for behavioral interfaces, `t` for derived types, and `p` for primitive aliases.

## Automation ownership

Concrete executable behavior belongs in `automation/` when it is replaceable user/versioned behavior. Core must not gain special execution logic for a new semantic group merely because the default automation contains one.

A module may inherit convenience behavior from Nodus-owned role classes, but Core accepts it structurally. User modules do not need to inherit a Nodus interface or base class if their executable shape matches the Core contract.

## Deprecated directories

During architectural migration, incompatible legacy implementations are quarantined under `Deprecated/` instead of distorting the new contract.

The previous production coordinator is `src/engine/Deprecated/EngineOld.ts`. The previous fixed semantic Step runtime is `src/engine/Deprecated/Process/` plus `src/engine/Deprecated/Step/`. Legacy `Planner`, `EngineTest`, and `Task` families are likewise kept there because their contracts are tied directly to the previous Engine lifecycle.

Other old-only mechanics should be moved into Deprecated when the new execution path proves they belong only to the previous lifecycle. Preserve them instead of deleting them while the migration is still discovering lost responsibilities.

New Core code must not depend on Deprecated code. Existing application composition may continue to use Deprecated paths until its automation is migrated.

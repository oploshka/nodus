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

  Step/
    Planner/
    Worker/
    Qualifier/
    Research/
    Action/
    Determine/

  Deprecated/
    EngineOld.ts
    Process/
    Step/
    Planner/
    Worker/
    Determine/
    EngineTest/
    Task/
```

`Engine.ts` is the public facade. `Core/` owns only generic orchestration mechanics: module registration, group policy, `SEQUENCE`, explicit context projection, transitions and `OUTPUT | SCHEMA` execution.

`Step/` contains only small Nodus-owned convenience contracts for semantic module groups. It does not own execution runners. User modules remain structural and do not need to inherit these classes.

The earlier fixed-`STEP` schema runtime is preserved under `Deprecated/Process/` and `Deprecated/Step/`. The old Plan/Planner, Worker runtime, Determine, Engine-owned test lifecycle and Task/TaskRun models are also preserved under `Deprecated/`. New Core code must not depend on them.

`Process/Edit` and `Process/Research` remain in place while the new execution path is still establishing their eventual ownership.

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

The active automation surface is intentionally small while the new execution path is proven vertically:

```text
automation/
  Action/
  Planner/
  Worker/
    WorkerCode/
  Deprecated/
```

Legacy Determine, Qualifier, Research strategy, Agent Worker and Documentation Worker implementations are preserved under `automation/Deprecated/`. They remain available to `EngineOld`, but they are not part of the active automation surface.

A module may inherit convenience behavior from Nodus-owned Step classes, but Core accepts it structurally. User modules do not need to inherit a Nodus interface or base class if their executable shape matches the Core contract.

Worker orchestration belongs in the Worker schema. `WorkerCode` declares the concrete modules it depends on; the Worker base class exposes them to Core and gives the schema stable names such as `WorkerCode::ActionCodeChange`. Core executes the resulting schema.

## Deprecated directories

During architectural migration, incompatible legacy implementations are quarantined under `Deprecated/` instead of distorting the new contract.

The previous production coordinator is `src/engine/Deprecated/EngineOld.ts`. The previous fixed semantic Step runtime is `src/engine/Deprecated/Process/` plus `src/engine/Deprecated/Step/`. Legacy `Planner`, `Worker`, `Determine`, `EngineTest`, and `Task` families are likewise kept there because their contracts are tied to previous execution models.

Other old-only mechanics should be moved into Deprecated when the new execution path proves they belong only to the previous lifecycle. Preserve them instead of deleting them while the migration is still discovering lost responsibilities.

New Core code must not depend on Deprecated code. Existing application composition may continue to use Deprecated paths until its automation is migrated.

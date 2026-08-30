# Core

Nodus 0.5 Core is a small orchestration kernel. It owns the call chain, local `SEQUENCE` execution, module lookup, explicit context projection, returned-schema execution and group authority checks. Planner, Worker, Research, Action, Test and other semantic roles are application-level module groups rather than a fixed Core enum.

## Initialization

The Engine receives one initialization config:

```ts
const engine = new Engine({
  start: PlannerTask,

  groups: {
    planner: {
      schema: {
        allowedGroups: ['worker', 'research'],
      },
    },

    worker: {
      schema: {
        allowedGroups: ['action', 'research'],
      },
    },

    action: {
      schema: false,
    },
  },

  modules: {
    PlannerTask,
    WorkerCode,
    WorkerDocumentation,
    ActionReadFile,
  },
});
```

The object key is the module name visible to Core and schemas. Modules do not need a separate `id`. Registering the same module definition more than once is rejected.

`start` is the module definition used for the first step. It must also be present in `modules`. Core does not special-case Planner; today the configured start module is the single Planner, while a future classifier may itself become the start module when several planners need selection.

## Module contract

A module is structural. It does not have to inherit a Nodus base class as long as it exposes the same executable shape:

```ts
interface iCoreModule {
  readonly group: string;
  execute(request): Promise<OUTPUT | SCHEMA>;
}
```

Nodus-owned modules may inherit their `group` from role-specific base classes. User modules may provide the same shape directly.

`modules` accepts ready executable objects and zero-argument classes. Core resolves the object key into an internal registry during initialization.

## Groups

Groups are configured separately from implementations. A group defines authority shared by its modules, not the list of modules belonging to it.

```ts
worker: {
  schema: {
    allowedGroups: ['action', 'research'],
  },
}
```

A module whose group has `schema: false` may return only an output. A module whose group may return schema is constrained to modules from `allowedGroups`. Core validates nested returned `SEQUENCE` structures and validates the chain again after a transition rewrites its remaining tail.

This keeps authority in initialization config instead of hard-coding semantic roles into Core.

## Sequence

`SEQUENCE` remains a reserved structural primitive owned by Core. It is not a module group and has no implementation.

A normal executable step names a registered module:

```ts
{
  module: 'WorkerCode',
  task: 'Implement the requested change',
}
```

A module may return a nested `SEQUENCE`. Context is explicit and local: a step may request its parent input, previous output, or selected completed steps from the current sequence. Transitions may change only the unfinished tail; the completed prefix is immutable.

## Migration

`src/engine/Engine.ts` is the new Core entry point. The previous production coordinator is preserved as `src/engine/Deprecated/EngineOld.ts` so behavior is not lost during migration.

The current application bootstrap still composes `EngineOld` until automation modules are adapted to the new structural Core module contract. Existing `Process/` and `Step/` code remains available during this migration and is not deleted merely because the first Core path does not use it.

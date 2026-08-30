# Process Step

The first Nodus 0.5 schema prototype modeled semantic roles through a fixed `STEP` enum and role-specific runners under `src/engine/Step/`. That implementation remains in the repository as a migration surface, but it is no longer the intended configuration boundary of the new Engine Core.

## Current direction

The new Core owns only structural orchestration. `SEQUENCE` remains a reserved Core primitive, while semantic execution groups are declared by Engine initialization config.

```text
Core
  SEQUENCE
  module registry
  group policy
  explicit context
  transitions
  OUTPUT | SCHEMA

configuration / automation
  planner
  worker
  research
  action
  test
  custom user groups
```

A schema step names a registered module rather than selecting from a fixed semantic enum:

```ts
{
  module: 'WorkerCode',
  task: 'Implement the requested change',
}
```

The module itself declares its group. Nodus-owned modules may inherit that group from a role-specific base class; user modules only need to match the structural Core module contract.

Group authority is defined separately from module implementations:

```ts
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
}
```

Core validates returned and transition-mutated schemas against these policies recursively.

## Existing Step code

The current directories remain available while automation is migrated:

```text
src/engine/Process/Process/
src/engine/Step/
  Worker/
  Planner/
  Qualifier/
  Determine/
  Research/
  Action/
```

They contain useful contracts and behavior from the earlier schema-driven prototype. They should be moved to Deprecated or adapted only after the new Engine path makes their remaining responsibilities clear; they are not being deleted during this migration.

See `doc/architecture/core.md` for the current Engine/Core boundary.

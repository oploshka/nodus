# Project conventions

These rules describe code layout and naming conventions. Architecture-specific responsibilities belong in the layer documentation next to the code, not here.

## Imports and aliases

Use project aliases for imports across code modules instead of long relative paths.

- `@app/*` → `src/app/*`
- `@engine/*` → `src/engine/*`
- `@model/*` → `src/model/*`
- `@test/*` → `test/*`
- `@bench/*` → `benchmark/*`

Relative imports are acceptable only for truly local implementation details when they improve readability. Do not use `../../..` to cross architectural/module boundaries.

## Directory naming

Top-level technical/category directories use lowercase names, for example:

- `src`
- `test`
- `doc`
- `benchmark`

The aliased architecture roots under `src` also remain lowercase:

- `src/app`
- `src/engine`
- `src/model`

Semantic code-module directories below those roots use PascalCase:

- `src/app/Cli`
- `src/app/Config`
- `src/engine/Planner`
- `src/engine/Research`
- `src/engine/Project`
- `src/engine/Worker`
- `src/model/Runner`
- `src/model/Response`
- `src/model/Tool`

Technical/category directories may stay lowercase when that meaning is intentional. In particular, the first level under `test` describes test layers and stays lowercase:

- `test/unit`
- `test/integration`
- `test/model`
- `test/e2e`
- `test/framework`
- `test/logs`

## Types

A layer may expose a PascalCase `Type` directory for contracts shared outside one internal module, for example `src/engine/Type` and `src/model/Type`.

Do not create a nested `Type` directory for every subsystem. Internal interfaces/types should normally stay in the file that owns the corresponding logic, or beside that implementation when they genuinely need a separate file.

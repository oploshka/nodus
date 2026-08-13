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

## Documentation placement

The repository root keeps only `README.md` as the entry point/index. Cross-project architecture, roadmap, conventions and handoff documents belong under `doc`.

Layer-specific documentation may live beside the layer it describes (for example `src/app/APPLICATION.md`, `src/engine/ENGINE.md`, `src/engine/Worker/WORKER.md`, `src/model/MODEL.md`). This is intentional: important local contracts should be discoverable next to the code. Do not rename every local document to `README.md`.


## Язык документации и архитектурных решений

Все новые архитектурные идеи, решения, roadmap/handoff записи и поясняющая документация проекта фиксируются **на русском языке**. Это правило относится именно к человеческой проектной документации и обсуждению архитектуры.

Идентификаторы кода, имена файлов/типов/API, значения протокольных полей и machine-facing internal prompts могут оставаться на английском, когда это соответствует коду или runtime language policy. Не переводить идентификаторы ради документации.

Если существующий документ частично написан на английском, его не требуется одномоментно переписывать целиком; при актуализации соответствующего раздела предпочтительно переводить его на русский и дальше вести на русском.

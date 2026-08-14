# Conventions проекта

Этот документ фиксирует правила структуры и именования кода. Архитектурные responsibilities описываются в `doc/architecture/`, а правила самой документации — в `doc/project/documentation.md`.

## Imports и aliases

Для перехода между code modules используются project aliases вместо длинных relative paths:

- `@app/*` -> `src/app/*`
- `@engine/*` -> `src/engine/*`
- `@model/*` -> `src/model/*`
- `@test/*` -> `test/*`
- `@target/*` -> `target/*`
- `@benchmark/*` -> `target/benchmark/*`
- `@mock/*` -> `target/mock/*`
- `@project/*` -> `target/project/*`
- `@test-framework/*` -> `target/test-framework/*`

Relative imports допустимы для действительно локальных implementation details, когда это улучшает читаемость. Не использовать `../../..` для пересечения архитектурных/module boundaries.

## Имена директорий

Top-level technical/category directories используют lowercase: `src`, `test`, `doc`, `target`.

Architecture roots под `src` также lowercase: `src/app`, `src/engine`, `src/model`.

Semantic code-module directories ниже этих roots используют PascalCase, например `src/app/Cli`, `src/engine/Planner`, `src/engine/Research`, `src/engine/Worker`, `src/model/Runner`, `src/model/Response`.

Technical/category directories могут оставаться lowercase, когда это часть их смысла: `test/unit`, `test/integration`, `test/model`, `test/e2e`, `target/test-framework`.

## Types

Слой может иметь PascalCase `Type` directory для contracts, разделяемых за пределами одного internal module, например `src/engine/Type` и `src/model/Type`.

Не создавать nested `Type` для каждой подсистемы. Internal interfaces/types обычно остаются в файле, владеющем логикой, или рядом с implementation, если отдельный файл действительно нужен.

## Документация

Корневой `README.md` — entry point/index. Архитектурные документы централизуются в `doc/architecture/`. Roadmap и active work находятся в `doc/development/`, правила проекта — в `doc/project/`, прошлые состояния — в `doc/history/`, неподтверждённые направления — в `doc/research/`.

Документ рядом с кодом оставляется только при сильной локальной связи с конкретной директорией и получает осмысленное имя. Внутренние `README.md` не используются.

Полные правила: [`documentation.md`](documentation.md).

## Язык

Новые архитектурные идеи, решения, roadmap/handoff записи и поясняющая документация проекта фиксируются на русском языке.

Идентификаторы кода, имена файлов/типов/API, protocol values и machine-facing prompts сохраняют форму, соответствующую коду/runtime policy. Идентификаторы не переводятся ради документации.

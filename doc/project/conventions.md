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

Для новых contracts используем lowercase-префикс, который обозначает семантическую категорию, а не только синтаксис TypeScript:

- `s` — structure: пассивная структура данных. Объявляется через `interface`, например `sTargetConfig`.
- `i` — interface/capability: контракт поведения, преимущественно набор действий. Объявляется через `interface`, например `iFileReader`. Значения допустимы, но не должны превращать capability в DTO.
- `p` — primitive: семантический alias над primitive/value-domain, например `pProjectId`, `pFilePath`, `pPort` или literal union `pWorkerStatus`. Используется для value-like типов, а не для произвольного `type`.
- `t` — transformed/derived type: вычисляемый, преобразованный или составной type, когда `interface` не выражает нужную семантику, например результат `ReturnType`, `Awaited`, conditional/mapped type.

Префиксы пишутся в нижнем регистре, чтобы визуально отделять категорию от PascalCase-имени. Старые contracts не переименовываются массово только ради соглашения; новые создаются по новому правилу, а существующие приводятся к нему при содержательной переработке соответствующей зоны.

`s` и `i` намеренно оба используют `interface`: различие между ними архитектурное. `s*` описывает форму данных, `i*` — возможность/поведение.

## Имена частей одного компонента

Если законченный компонент собран из нескольких тесно связанных implementation parts, используем `_` как naming convention принадлежности к родительскому компоненту:

```text
ProjectFileIndex
ProjectFileIndex_Scanner
ProjectFileIndex_Store
ProjectFileIndex_Search
```

Имя до `_` — родительский компонент или семейство, имя после `_` — специализированная часть его реализации. Такой маркер означает для читающего код: часть рассматривается прежде всего через родительский компонент и не является самостоятельной архитектурной сущностью.

`_` не является технической private/protected-защитой и не требует искусственных export-ограничений. Это визуальная и архитектурная договорённость для людей, знающих conventions проекта. Реальную изоляцию не усложняем без отдельной практической причины.

Связанные части складываются рядом в директорию родителя, например `src/engine/Project/File/Index/`. Полные имена намеренно сохраняются даже внутри такой директории: локальная краткость не должна терять квалификацию при чтении import, stack trace, поиска или открытого файла отдельно от дерева проекта.

## Config naming

Внешняя конфигурация Nodus описывает target, с которым работает runtime, а не внутреннюю `Project`-модель Engine. Поэтому для нового API используем термин `target`, а не `project`:

```ts
interface sTargetConfig {
  id: pProjectId;
  root: pFilePath;
}
```

В `nodus.config` этому соответствует секция `target`.

`Project` остаётся внутренним архитектурным понятием Nodus для специализированных представлений и знаний о target (`ProjectFileIndex`, Project Knowledge и другие представления). Это позволяет не смешивать внешний target configuration с внутренней моделью Project.

Semantic defaults не должны задаваться configuration loader или composition root только потому, что там собираются зависимости. Default остаётся в компоненте, который понимает его смысл; Bootstrap передаёт явно заданные значения и связывает компоненты.

## Документация

Корневой `README.md` — entry point/index. Архитектурные документы централизуются в `doc/architecture/`. Roadmap и active work находятся в `doc/development/`, правила проекта — в `doc/project/`, прошлые состояния — в `doc/history/`, неподтверждённые направления — в `doc/research/`.

Документ рядом с кодом оставляется только при сильной локальной связи с конкретной директорией и получает осмысленное имя. Внутренние `README.md` не используются.

Полные правила: [`documentation.md`](documentation.md).

## Язык

Новые архитектурные идеи, решения, roadmap/handoff записи и поясняющая документация проекта фиксируются на русском языке.

Идентификаторы кода, имена файлов/типов/API, protocol values и machine-facing prompts сохраняют форму, соответствующую коду/runtime policy. Идентификаторы не переводятся ради документации.

# Coding-agent navigation

Цель этого файла — сокращать лишнее исследование репозитория перед локальными изменениями. Не восстанавливай всю архитектуру Nodus для каждой задачи: начинай с минимального релевантного scope и расширяй его только по обнаруженным зависимостям.

## Источники знания

Используй источники в таком порядке:

1. текущий код — authoritative для фактического поведения;
2. `doc/architecture/` — authoritative описание текущей архитектуры;
3. `doc/project/` — устойчивые conventions и инженерные правила;
4. `doc/development/` — активная работа и roadmap, но не текущий runtime contract;
5. `doc/history/` — только причины прошлых решений;
6. `doc/research/` — гипотезы, а не текущая архитектура.

`README.md` используй как индекс. Для быстрого восстановления архитектурного контекста предпочитай `doc/architecture/current-state.md` вместо чтения всей документации.

Не читай `doc/history/`, `doc/research/`, benchmark-материалы и весь `target/` превентивно. Открывай их только если задача прямо относится к истории решения, исследовательской гипотезе, benchmark/test framework или target fixture.

## Scope discipline

- Начинай с файлов, символов и модуля, прямо названных задачей.
- Расширяй scope только по прямым imports, contracts, callers/consumers или наблюдаемому поведению.
- Не делай project-wide search, если локальный модуль уже даёт достаточный контекст.
- Различай изменение implementation и изменение shared contract. Локальная implementation-задача не требует автоматически проверять все архитектурные слои.
- Если shared contract действительно меняется, проверь его прямых consumers и соответствующие focused tests.
- Не обновляй архитектурную документацию для чисто внутреннего рефакторинга без изменения описываемого поведения или boundary.

## Карта репозитория

- `src/app/` — startup, composition, CLI и concrete presentation/logging;
- `src/engine/` — runtime contracts, execution mechanics, project understanding, Edit и Engine behavior;
- `src/model/` — model/provider transport, request/response formats и model execution boundary;
- `automation/` — concrete versioned Planner/Worker/Action behavior поверх Engine contracts;
- `test/` — active tests;
- `target/` — fixtures, test framework, benchmark и вспомогательные project targets;
- `doc/` — знания о проекте с разным статусом, описанным выше.

Nodus 0.5 остаётся в процессе архитектурной миграции. Если задача касается Process/Engine lifecycle, Planner/Worker boundaries или compatibility behavior, сначала прочитай `doc/architecture/current-state.md`. Для локальных задач в других областях это не обязательный шаг.

## Validation

Используй самый узкий достаточный способ проверки изменения: focused test/project test прежде полного suite. Полный `typecheck`, build или полный test suite нужен для cross-cutting изменения либо когда более узкой проверки недостаточно.

Вложенный `AGENTS.md` уточняет эти правила для своей директории и имеет приоритет для локальной работы.

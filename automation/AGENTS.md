# Automation scope guidance

`automation/` содержит concrete versioned behavior поверх Engine contracts. Здесь предпочитай локальные изменения Planner/Worker/Action behavior вместо расширения Core, если существующих runtime capabilities достаточно.

## Правила scope

- Concrete Planner/Worker/Action logic меняй здесь, если задача не требует нового общего runtime contract.
- Не дублируй в automation generic execution mechanics, validation или state ownership, уже принадлежащие Engine.
- Новую Action рассматривай как bounded reusable capability, а не как техническую фазу ради одного сценария.
- Если существующий Engine contract достаточен, не меняй `src/engine/Core/` ради удобства одной automation implementation.
- Если contract действительно недостаточен, сначала сформулируй минимальное требуемое изменение boundary и проверь его прямых consumers.
- Для локального изменения Worker/Action не исследуй все другие automation modules, benchmarks или historical docs без прямой зависимости.

Для задач, связанных с миграцией Process/Worker semantics или compatibility behavior, используй `doc/architecture/current-state.md`. Для обычной локальной правки concrete behavior достаточно текущего кода и ближайших tests.

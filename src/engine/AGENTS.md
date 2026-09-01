# Engine scope guidance

`src/engine/` владеет runtime contracts и mechanics. При локальной задаче не исследуй весь Engine: начинай с конкретной подсистемы и расширяй scope только при изменении её внешнего contract.

## Основные зоны

- `Core/` — schema/runtime contracts и execution semantics;
- `Process/` — execution mechanics конкретных Process concerns, включая Edit;
- `Step/` — общие категории и базовые contracts шагов;
- `Project/` — специализированные представления и знания о target project;
- `Common/` — действительно shared mechanics, не semantic ownership конкретной подсистемы;
- `Engine.ts` — orchestration/control boundary верхнего уровня.

## Правила scope

- Изменение внутри implementation-файла не означает автоматически изменение Core contract.
- Изменения `EngineSchema`, `EngineRuntime`, `EngineStep` или общих dependency/event contracts считай high-fanout: проверь прямых consumers в `automation/`, `src/app/` и focused tests.
- Для локальных Edit/Project/Step изменений не открывай `src/model/` или всю `automation/`, пока direct imports/contracts не покажут необходимость.
- Concrete Planner/Worker/Action behavior обычно принадлежит `automation/`, а не Engine Core.
- Не переноси deterministic mechanics в model-facing код без конкретной semantic причины.

## Current migration

Если задача затрагивает Process lifecycle, Planner/Worker execution, schema transitions или compatibility path, сначала используй `doc/architecture/current-state.md` как короткий handoff. Исторические документы для этого не нужны, если задача не требует rationale.

## Edit boundary

Task-local Edit принадлежит Engine. Сохраняй distinction между подготовкой изменений, task-local state и физическим apply. Не расширяй ownership Engine на внутренние решения Worker/Action без изменения архитектурного contract.

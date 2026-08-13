# Edit layer

`src/engine/Edit` — Engine-owned boundary между semantic change intent и физической мутацией Project.

Текущий поток:

```text
Worker / ChangeCodeAction
  -> ProjectEditRequest { strategy, edits[] }
  -> Engine
  -> ProjectEditor.prepare in memory
  -> EditStrategy
  -> validate complete prepared set
  -> atomic commit
  -> Validation
```

## Ownership

Worker отвечает на вопрос **что нужно изменить**. Его `ChangeCodeAction` возвращает только project-root-relative path и semantic instruction для файла. Worker не читает authoritative source ради технического edit protocol и не генерирует diff/range/full-file payload.

Edit layer отвечает на вопрос **как выразить и безопасно применить изменение**. Здесь живут model calls edit-стратегий, applicators, buffered multi-edit state, stale-source guard, atomic multi-file commit и rollback записи при ошибке.

Engine решает **когда** запускать Editor и только после успешного Edit передаёт результат в Validation.

## Strategies

- `range-replace` — небольшие guarded line ranges; текущий default для Code Worker;
- `replace` — exact before/after blocks;
- `diff` — unified diff с локальным recovery;
- `edit` — полный resulting file.

Стратегии реализуют один `EditStrategy` contract и не являются Worker Actions.

## Atomicity

Все intents одного Worker result сначала готовятся в памяти. Несколько intents одного файла применяются последовательно к buffered current content. Если любой intent не подготовился, Project не меняется.

Перед первой записью Editor повторно читает все затронутые файлы и проверяет `expected` against current content. После начала commit ошибка записи вызывает best-effort rollback уже записанных файлов.

## Later

Следующий отдельный уровень — task-wide virtual workspace: PlanSteps должны видеть изменения предыдущих шагов до физического commit, а окончательный commit может принадлежать всей Task. Это намеренно не реализовано в текущем слое.

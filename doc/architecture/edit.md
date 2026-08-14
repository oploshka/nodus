# Edit layer

Edit — Engine-owned boundary между semantic change intent и физической мутацией Project.

Текущий поток:

```text
Worker / ChangeCodeAction
  -> ProjectEditRequest { strategy, edits[] }
  -> Engine
  -> ProjectEditor.prepare in memory
  -> EditStrategy
  -> validate complete prepared set
  -> commit
  -> Validation
```

## Ownership

Worker отвечает за semantic вопрос **что нужно изменить**. Его change intent содержит project-root-relative path и instruction для требуемого результата.

Edit layer отвечает за **как выразить и безопасно применить изменение**. Здесь находятся model calls edit-стратегий, applicators, buffered multi-edit state, stale-source guards, commit и rollback mechanics.

Engine решает, когда запускать Editor и когда передавать результат в Validation.

## Strategies

Текущие `EditStrategy`:

- `range-replace` — guarded line ranges;
- `replace` — exact before/after blocks;
- `diff` — unified diff;
- `edit` — полный resulting file.

Стратегии не являются Worker Actions.

## Atomicity

Все intents одного Worker result сначала готовятся в памяти. Несколько intents одного файла применяются последовательно к buffered current content. Если любой intent не подготовился, Project не меняется.

Перед первой записью Editor повторно проверяет затронутые targets и stale source. Ошибка записи после начала commit вызывает best-effort rollback уже записанных файлов.

## Recovery и fallback

Technical recovery принадлежит Edit layer, а не Worker. Semantic intent не вычисляется заново только потому, что технический edit не применился.

Для `range-replace` предусмотрен один bounded localization retry с authoritative buffered file, исходной instruction, предыдущими operations и applicator error. Recovery может уточнить localization/context, но не должен расширять или переинтерпретировать requested change.

После неуспешной подготовки `ProjectEditor` может перейти к другой зарегистрированной стратегии, сохраняя тот же semantic intent и authoritative buffered source. Текущие базовые цепочки:

- `range-replace -> diff -> edit`;
- `replace -> diff -> edit`;
- `diff -> edit`;
- `edit` без fallback.

## Дальнейшее направление

Task-wide virtual workspace — отдельный уровень: последующие PlanSteps и Research должны видеть виртуально изменённое состояние, а окончательный commit потенциально может принадлежать всей Task. Это не часть текущего Editor contract. См. [`../research/virtual-workspace.md`](../research/virtual-workspace.md).

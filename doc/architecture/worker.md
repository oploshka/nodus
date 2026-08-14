# Worker

Worker исполняет один `PlanStep` через bounded Action loop.

Текущий code/documentation flow использует:

- `ChangeCodeAction` — определяет semantic edit intent (`path + instruction`) и при нехватке данных формулирует Research requests;
- `ResearchAction` — получает конкретные project facts и возвращает их в Worker session.

`ChangeCodeAction` не владеет edit serialization. Он не строит diff/range-replace/full-file payload и не пишет Project. При готовности изменения Worker возвращает `ProjectEditRequest`, где `edits[]` описывают требуемый semantic результат, а strategy остаётся execution preference.

```text
PlanStep
  -> Worker
  -> ChangeCodeAction
       -> ready: ProjectEditRequest
       -> missing-information: Research requests
  -> Engine / ProjectEditor
```

Technical EditStrategy и applicators принадлежат Engine Edit layer. Подробности: [`edit.md`](edit.md).

Worker может завершить step как `completed`, `not-completed` или `failed`. Настоящий continuation того же Worker instance пока не реализован.

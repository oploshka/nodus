# Worker

Worker исполняет один `PlanStep` через bounded Action loop.

Текущий code/documentation Worker содержит:

- `ChangeCodeAction` — определяет semantic edit intent (`path + instruction`) и при нехватке данных запрашивает Research;
- `ResearchAction` — получает конкретные project facts и возвращает их в Worker session.

`ChangeCodeAction` больше не владеет edit serialization. Он не строит diff/range-replace/full-file и не пишет Project. При `ready` он возвращает `ProjectEditRequest`, где стратегия является предпочтением исполнения, а `edits[]` описывают только требуемый результат каждого файла.

```text
PlanStep
  -> Worker
  -> ChangeCodeAction
       -> ready: ProjectEditRequest
       -> missing-information: Research requests
  -> Engine/Edit
```

Edit strategies и applicators находятся в `src/engine/Edit`; подробности см. [`../Edit/EDIT.md`](../Edit/EDIT.md).

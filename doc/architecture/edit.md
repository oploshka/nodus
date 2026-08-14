# Edit layer

Edit — Engine-owned механизм накопления и применения файловых изменений Task.

```ts
Edit(Project) {
  read(path)          // сначала накопленное состояние, затем Project
  change(...)         // materialize semantic change и сохранить его в памяти
  state()             // checkpoint
  restore(state)      // вернуть накопленные изменения к checkpoint
  apply(state?)       // физически записать выбранное состояние в Project
}

Engine(task) {
  const edit = createEdit()

  Worker.run(step1, edit) // Worker/Research читают через Edit
  checkpoint = edit.state()

  Worker.run(step2, edit) // видит изменения step1

  if (step2.failed)
    edit.restore(checkpoint)

  edit.apply()            // запись накопленного результата после успешной Task
}
```

## Ownership

Engine создаёт отдельный `ProjectEditor` для Task и владеет `state / restore / apply`.

Worker получает Edit как ограничиваемый в будущем execution tool. `ChangeCodeAction` по-прежнему отвечает только за semantic вопрос **что изменить**, а Edit владеет materialization через `EditStrategy`.

Research, вызванный из `IterativeWorker`, читает source content через текущий Edit. `AgentWorker` также передаёт `file-system read/write` через Edit. Search/terminal/git tools пока работают с физическим Project и не считаются task-local view.

## Накопленное состояние

Текущая реализация хранит простую map существующих файлов: original content + current task-local content. Create/delete/move пока не входят в этот contract.

Изменения успешного step остаются в Edit для следующего step. Перед Worker Engine сохраняет checkpoint; при failure накопленное состояние возвращается к состоянию до этого step.

## Strategies

Текущие `EditStrategy`:

- `range-replace`;
- exact `replace`;
- unified `diff`;
- full-file `edit`.

Technical recovery/fallback остаётся внутри Edit. Последовательные changes одного файла материализуются относительно текущего task-local content, а не только исходного файла на диске.

## Apply

`apply()` записывает накопленное состояние в Project только после успешного выполнения steps. Перед записью сохраняются target/stale-source checks; ошибка физической записи остаётся внутренней проблемой Edit и использует существующий best-effort rollback.

Engine-level Validation пока оставлен после `apply()` как временная граница. Его дальнейшее распределение (`EditValidator`, Worker-level testing, итоговые Engine checks) будет рассмотрено после стабилизации механики Edit.

## Известные ограничения

- Research cache/hash semantics пока основаны на физическом Project и могут не учитывать task-local content;
- Search/Terminal/Git tools пока не работают поверх накопленного Edit;
- create/delete/move пока не поддержаны task-local state;
- partial apply/user decision после failure пока не имеет отдельного Engine API, хотя checkpoint состояния сохраняется.

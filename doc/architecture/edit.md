# Edit layer

Edit — Engine-owned механизм накопления и применения файловых изменений Task.

```ts
Edit(Project) {
  change(task, step, intents[]) {
    results = EditStrategy.run(intents, changes, Project) // готовим весь batch отдельно
    validation = EditValidator.validate(results)          // проверяем batch до накопления

    // warning сохраняется в лог и не блокирует изменение
    // failed не позволяет batch попасть в накопленное состояние

    changes.setMultiple(results)                          // batch становится новым состоянием Edit
  }

  read(path)          // сначала накопленное состояние, затем Project
  state()             // checkpoint
  restore(state)      // вернуть накопленные изменения к checkpoint
  apply(state?)       // физически записать выбранное состояние в Project
}

Engine(task) {
  const edit = createEdit()

  Worker.run(step1, edit)
  checkpoint = edit.state()

  Worker.run(step2, edit) // видит изменения step1

  if (step2.failed)
    edit.restore(checkpoint)

  edit.apply()
  EngineTest.run()
}
```

## Ownership

Engine создаёт отдельный `ProjectEditor` для Task и владеет `state / restore / apply`.

Worker получает Edit как ограничиваемый в будущем execution tool. `ChangeCodeAction` отвечает за semantic вопрос **что изменить**, а Edit владеет materialization через `EditStrategy`.

Research, вызванный из `IterativeWorker`, читает source content через текущий Edit. `AgentWorker` также передаёт `file-system read/write` через Edit. Search/terminal/git tools пока работают с физическим Project.

## Накопленное состояние и batch

Текущая реализация хранит map существующих файлов: original content + current task-local content. Create/delete/move пока не входят в contract.

Один `ProjectEditRequest` может содержать несколько intents и затрагивать несколько файлов. Edit сначала materialize'ит весь request в draft-state. Только после успешной materialization и `EditValidator` draft целиком становится новым накопленным состоянием. Таким образом частично подготовленный batch не попадает в `changes`.

Изменения успешного step остаются в Edit для следующего step. Перед Worker Engine сохраняет checkpoint; при failure накопленное состояние возвращается к состоянию до этого step.

## EditValidator

`EditValidator` получает подготовленный batch до его добавления в накопленное состояние. Checks возвращают результаты `passed / warning / failed`.

Первый check — `JsonEditValidationCheck`. Он делает strict `JSON.parse`, но parse failure пока является только `warning`: example/config файлы могут намеренно содержать JSON-like syntax, комментарии или другие отклонения от strict JSON.

Blocking `failed` зарезервирован для проверок, при которых prepared batch действительно нельзя принимать. При наличии такого результата `change()` не меняет накопленное состояние.

## Strategies

Текущие `EditStrategy`:

- `range-replace`;
- exact `replace`;
- unified `diff`;
- full-file `edit`.

Technical recovery/fallback остаётся внутри Edit. Последовательные changes одного файла materialize'ятся относительно текущего task-local content.

## Apply

`apply()` записывает накопленное состояние в Project только после успешного выполнения steps. Перед записью сохраняются target/stale-source checks; ошибка физической записи остаётся внутренней проблемой Edit и использует существующий best-effort rollback.

После `apply()` Engine может запускать отдельный `EngineTest`; он проверяет итоговый Project и не заменяет `EditValidator`.

## Известные ограничения

- Research cache/hash semantics пока основаны на физическом Project и могут не учитывать task-local content;
- Search/Terminal/Git tools пока не работают поверх накопленного Edit;
- create/delete/move пока не поддержаны task-local state;
- partial apply/user decision после failure пока не имеет отдельного Engine API, хотя checkpoint состояния сохраняется.

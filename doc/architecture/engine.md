# Engine

`Engine.run()` координирует один task run. Он владеет `Task`, global `Plan`, выбором Worker, task-local Edit и моментом, когда накопленный результат становится физическим состоянием Project.

Упрощённая логика:

```ts
Engine(task) {
  const edit = createEdit()

  for (step of plan) {
    const checkpoint = edit.state()
    const result = Worker.run(step, edit)

    if (result.failed) {
      edit.restore(checkpoint)
      break
    }
  }

  edit.apply()
  EngineTest.run()
}
```

Engine не знает конкретные Research-вопросы Worker, внутренний порядок Actions или provider transport. Он передаёт Worker task-local Edit как execution tool, но ownership `state / restore / apply` остаётся у Engine.

## Services

`Planner`, `Research` и `Determine` — bounded services с конкретным ожидаемым результатом. Они могут использовать модель, но не владеют всем task lifecycle.

`Determine` выбирает один option из ограниченного набора. Сейчас Engine использует его для Worker routing, но сервис не является Worker-specific abstraction.

`Research` отвечает на bounded project question и владеет persistent cache/hash invalidation. Он не является Worker и не запускается как обязательная стадия каждого шага.

## Worker results

- `completed` — Worker считает semantic работу PlanStep завершённой;
- `not-completed` — текущая попытка закончилась, но состояние потенциально пригодно для continuation;
- `failed` — execution path terminal.

Настоящий continuation API пока не реализован: новая пользовательская команда `продолжить` не является resume предыдущего Worker instance.

## Edit ownership

Один `ProjectEditor` живёт на протяжении Task. Worker может через него читать накопленное состояние и добавлять semantic changes, но Engine управляет checkpoint/restore/apply.

`ProjectEditor`:

- materialize semantic intent через зарегистрированные `EditStrategy`;
- выполняет technical recovery/fallback без повторного semantic reasoning Worker;
- готовит batch отдельно от накопленного state;
- запускает `EditValidator` до принятия batch;
- накапливает успешные изменения между PlanStep;
- физически пишет их только в `apply()`;
- при ошибке записи выполняет best-effort rollback уже записанных файлов.

`range-replace`, exact `replace`, unified `diff` и full-file `edit` являются Engine EditStrategy, а не Worker Actions.

## EngineTest

После успешного `Edit.apply()` Engine запускает `EngineTest` — project-level проверку итогового результата Task.

`ResolveEngineTest` явно означает отсутствие реальной проверки. `TypecheckEngineTest` и `UnitEngineTest` выполняют настроенные пользователем команды; несколько проверок объединяются через `CompositeEngineTest`.

Проверка prepared changes до apply относится не к EngineTest, а к `EditValidator`.

## Execution samples

Engine пишет execution samples и task statistics: task/step, candidates, выбранный Worker, outcomes, duration и доступные runtime metrics. Эти данные являются основой для будущих измерений Worker/Determine и model-capability экспериментов, но пока не образуют автоматическую execution policy.

## Interaction / control points

Engine является естественной control boundary между автономным execution и пользователем. Partial apply после незавершённой Task, proposal approval, correction, async interrupt, pause/resume и timeout semantics пока не являются завершённым runtime API.

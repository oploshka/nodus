# EngineTest

`EngineTest` — Engine-owned проверка итогового состояния Task после `Edit.apply()`.

```ts
EngineTest {
  run(task, changedPaths)
}

ResolveEngineTest {
  run() => passed // явный режим без project-level testing
}

TypecheckEngineTest {
  run() => configured typecheck command
}

UnitEngineTest {
  run() => configured unit-test command
}

Engine(task) {
  // Worker выполняет steps и Edit накапливает изменения
  Edit.apply()
  EngineTest.run()
}
```

`EngineTest` не выбирает автоматически, какие проверки нужны задаче. Конкретные реализации задаются configuration/composition layer. Если проверки не настроены, используется `ResolveEngineTest`.

Текущая configuration:

```json
{
  "engineTest": {
    "typecheck": {
      "command": "npm run typecheck",
      "timeoutMs": 120000
    },
    "unit": {
      "command": "npm test",
      "timeoutMs": 120000
    }
  }
}
```

Если настроено несколько tests, Bootstrap собирает их в `CompositeEngineTest`.

Worker-level testing остаётся отдельной возможностью: Worker позже может получить `TestAction`, если конкретный step или пользовательская задача требуют targeted проверки. Это не обязательная стадия каждого Worker.

Старый `Validation` layer пока остаётся в коде как материал для последующего перераспределения. Его Engine-owned command checks больше не являются основной границей orchestration.

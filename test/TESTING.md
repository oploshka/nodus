# Testing Nodus

Тестовый слой состоит из Vitest и собственного Nodus scenario harness.

## Vitest

Vitest подключён как npm dev dependency и отвечает за стандартную механику тестов: runner, assertions, filtering, projects, timeouts и watch mode.

Проекты:

- `unit` — быстрые изолированные тесты;
- `integration` — deterministic vertical slices со scripted model adapter;
- `model` — те же Nodus scenarios с реальной моделью;
- `e2e` — запуск через app/config/CLI boundary.

Model/e2e projects запускаются без file-level parallelism, чтобы локальные модели не конкурировали за один endpoint.

## test/framework

Собственный framework не заменяет Vitest. Он описывает только Nodus-specific окружение:

- `Scenario` — task, project fixture, runtime config и scripted responses;
- `ScenarioRunner` — создаёт временный project, собирает app через обычный Bootstrap и вызывает `Engine.runTask()`;
- `TestProject` — временное файловое окружение;
- `QueueModelAdapter` — deterministic transport fake;
- `LoggedModelAdapter` — wrapper реального/fake adapter для записи model traffic;
- `TestFileLogger` — один человекочитаемый timestamped log на scenario run.

## Logs

Отдельного runtime `Trace` storage нет.

Все runtime events пишутся через обычный logger interface. В тестах logger подменяется `TestFileLogger`, а model adapter может быть wrapped в `LoggedModelAdapter`/queue adapter. Поэтому один файл содержит последовательность:

- scenario start;
- Engine events;
- Planner/Worker decisions;
- Research cache hit/miss;
- action results;
- model request/response;
- scenario finish/error.

Имя файла:

```text
test/logs/<ISO timestamp>_<scenario>.log
```

Логи предназначены прежде всего для debug слабых/нестабильных model runs и по умолчанию не должны становиться assertion contract.

## Один Scenario — несколько режимов

Один и тот же scenario contract желательно использовать для:

1. deterministic integration test;
2. real-model test;
3. позже — сравнительного benchmark разных моделей/configurations.

Так мы сравниваем runtime/model, а не разные формулировки задачи.

## Команды

```bash
npm test
npm run test:unit
npm run test:integration
npm run test:model
npm run test:e2e
```

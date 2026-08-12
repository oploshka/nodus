# Testing Nodus

Тестовый слой состоит из Vitest и собственного Nodus scenario harness.

## Vitest

Vitest подключён как npm dev dependency и отвечает за стандартную механику тестов: runner, assertions, filtering, projects, timeouts и watch mode.

Проекты:

- `unit` — быстрые изолированные тесты;
- `integration` — deterministic vertical slices со scripted model adapter;
- `model` — те же Nodus scenarios с реальной моделью;
- `e2e` — запуск через app/Config/CLI boundary.

Model/e2e projects запускаются без file-level parallelism, чтобы локальные модели не конкурировали за один endpoint.

## test/framework

Собственный framework не заменяет Vitest. Он описывает только Nodus-specific окружение:

- `Scenario` — task, project fixture, runtime config и scripted responses;
- `ScenarioRunner` — создаёт временный project, собирает app через обычный Bootstrap и вызывает `Engine.run()`;
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

## ModelRunner contract tests

Unit tests model layer должны отдельно проверять две вещи:

1. `ModelRunner.run()` корректно собирает request из `message/data/guidance`, добавляет response-format/schema instructions и применяет per-call settings;
2. специализированные facade вроде `diffFile()` остаются тонкими wrappers над тем же pipeline и возвращают типизированный JS object.

Integration scenario не должен парсить raw model output самостоятельно: scripted responses проходят через настоящий `ModelRunner` и те же response handlers/schemas, что real-model run.

## Model logging

Обычные engine components вызывают модель через `ModelCaller`: полный `ModelRunResult` пишется в тот же timestamped scenario log, а component получает только `data`.

Поэтому один файл лога содержит:

- нормализованный request (`role + message`);
- нормализованный response;
- model settings/tokens/duration;
- последующие Engine/Worker/Research события.

`ModelRunner` можно вызывать напрямую только там, где тест/benchmark специально проверяет полный диагностический contract.

## Model contract tests

`test/unit/model` отдельно фиксирует boundary `ModelRunner` и common response schema. Это важно: format handler, schema validation и `ModelCaller` должны ломаться как unit regression до того, как ошибка попадёт в model/integration scenario.

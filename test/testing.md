# Тестирование Nodus

Тестовый слой состоит из Vitest и собственного Nodus scenario harness.

## Vitest

Vitest отвечает за runner, assertions, filtering, projects, timeouts и watch mode.

Проекты:

- `unit` — быстрые изолированные тесты;
- `integration` — deterministic vertical slices со scripted model adapter;
- `model` — те же Nodus scenarios с реальной моделью; отдельные файлы могут отсутствовать, пока нет актуальных model scenarios;
- `e2e` — запуск через app/configuration/CLI boundary.

Model/e2e projects запускаются без file-level parallelism, чтобы локальные модели не конкурировали за один endpoint.

## Target test framework

Собственный framework не заменяет Vitest. Он описывает Nodus-specific окружение:

- `Scenario` — task, project fixture, runtime config и scripted responses;
- `ScenarioRunner` — создаёт временный project, собирает app через обычный Bootstrap и вызывает `Engine.run()`;
- `TestProject` — временное файловое окружение;
- `QueueModelAdapter` — deterministic transport fake;
- `LoggedModelAdapter` — wrapper adapter для записи model traffic;
- `TestFileLogger` — человекочитаемый timestamped log scenario run.

Повторно используемые test doubles и небольшие fixtures складываются в `target/mock`, а не размазываются по отдельным unit-тестам.

## Logs

Отдельного runtime `Trace` storage нет. Runtime events пишутся через обычный logger interface. В тестах logger подменяется `TestFileLogger`, а model adapter может быть wrapped в `LoggedModelAdapter`/queue adapter.

Все runtime/test логи постепенно сводятся под корневую `log/` с разделением по зонам. `TestFileLogger` по умолчанию пишет в `log/test`; конкретный harness может выбрать другую zone или directory. Полноценная конфигурация log root остаётся отдельной задачей.

Логи предназначены прежде всего для debug нестабильных model runs и по умолчанию не являются assertion contract.

## Один Scenario — несколько режимов

Один scenario contract желательно использовать для deterministic integration test, real-model test и сравнительных benchmark'ов. Это уменьшает риск сравнивать разные формулировки задачи вместо runtime/model behavior.

## Команды

```bash
npm test
npm run test:unit
npm run test:integration
npm run test:model
npm run test:e2e
```

Документация о real-model прогонах вынесена в `doc/development/model-testing.md`.

## Model boundary tests

Unit tests model layer отдельно фиксируют `ModelRunner`, response schema/format handling и `ModelCaller`. Integration scenario не должен вручную парсить raw model output: scripted responses проходят через тот же model boundary, что real-model run.

## Runtime contract scenarios

Deterministic scenarios фиксируют routing order и hand-off boundaries, а не intelligence модели. High-value contracts включают semantic Planner steps, bounded Determine, explicit Worker Actions, Research только после concrete missing information, Research cache invalidation, canonical project paths и write policy.

Актуальные архитектурные границы описаны в `doc/architecture/`; тестовая документация не должна становиться вторым источником архитектурной истины.

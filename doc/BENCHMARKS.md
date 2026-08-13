# Benchmarks and experiments

Этот файл сохраняет контекст прошлых экспериментов, но не объявляет результаты универсальными свойствами Nodus.

На простом `/status` сценарии старая 14B-конфигурация после ограничения research/edit pipeline показывала существенно меньший runtime, чем та же модель в свободном agent loop. Основной эффект был получен не за счёт «улучшения интеллекта» модели, а за счёт переноса поиска, состояния, ограничений, retries и patch mechanics в Nodus.

Эти результаты используются только как мотивация архитектуры. Новая 0.3 реализация должна заново измеряться на одинаковых Scenario contracts.

При benchmark важно фиксировать:

- model/configuration;
- scenario id;
- число model calls;
- wall-clock duration;
- success/failure;
- execution log;
- изменённые файлы.

Model benchmarks следует запускать последовательно (`concurrency=1`).


## Raw-agent control group

`target/benchmark/RawAgentBenchmark.ts` намеренно обходит Engine/Planner/Research/Worker orchestration и запускает свободный tool loop на той же model/project configuration. Это контрольная группа для сравнения с Nodus, а не correctness test.

Запуск:

```bash
npm run benchmark:raw-agent -- nodus.config.json
```

Подробности transport/tool loop находятся в `target/benchmark/RAW-AGENT.md`.

## Raw-agent control

`target/benchmark/RawAgentBenchmark.ts` intentionally bypasses Engine/Planner/Research/Worker orchestration and remains a control group for comparing the same model and project tools against Nodus. Benchmark code is not a Vitest suite: correctness/regression belongs to `test/`, while timing/token/tool-call comparisons belong here.

## TODO: стоимость языка внутренних запросов

Проверить стоимость одинаковых machine-facing запросов при `language.nodus = en` и `language.nodus = ru`. Это отдельный benchmark-эксперимент, а не часть runtime language policy.

Для сравнения использовать одинаковые model/configuration, input data, response schema и sampling settings. Начать с нескольких небольших вызовов: Planner, Determine, Worker attempt и Research.

Фиксировать отдельно:

- prompt tokens;
- completion tokens;
- total tokens;
- duration.

Не считать заранее, что английский экономит примерно `2x`: вывод должен следовать из измерений.

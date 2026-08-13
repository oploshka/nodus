# Model capability benchmark

Этот benchmark измеряет пригодность конкретной модели к механике редактирования Nodus без Planner/Determine/Research noise.

Он **использует реальный `CodeWorker` и реальные ChangeCode Actions**, но первый model-call (`Attempt to complete...`) перехватывается benchmark adapter и получает заранее подготовленный `edits[]`. Поэтому модель не тратит время на поиск файлов/формирование intent: тестируется именно способность материализовать известную правку выбранной стратегией.

Проверяются стратегии:

- `replace` — exact before/after;
- `range-replace` — guarded line ranges;
- `diff` — unified diff;
- `edit` — полный resulting file.

Каждый case выполняется через benchmark-only `InMemoryBenchmarkProject`: `CodeWorker` и Actions видят обычный контракт `Project`, но чтение и запись происходят только в `Map` в памяти. После `Worker.run()` resulting content сравнивается с точным expected content. Временные копии проекта и filesystem commit для benchmark не нужны; на диск пишутся только timestamped логи и summary.

## Запуск

```bash
npm run benchmark:model-capabilities -- nodus.config.json
```

Только отдельные стратегии:

```bash
npm run benchmark:model-capabilities -- nodus.config.json --strategies range-replace,edit
```

Несколько повторов для более полезной статистики:

```bash
npm run benchmark:model-capabilities -- nodus.config.json --repeat 3
```

## Логи

Артефакты каждого прогона пишутся в `target/benchmark/model-capabilities/runs/<timestamp>/`:

```text
benchmark.log
edits.log
summary.json
```

`summary.json` хранит per-case status/correctness/duration/model-call/token metrics и aggregate по стратегии.

## Что важно сравнивать

Первичные метрики:

- `correct`: конечный файл буквально совпал с expected;
- `status`: что вернул Worker;
- `durationMs`: полный Worker runtime case;
- `modelCalls`: только реальные model calls стратегии; injected decision не учитывается;
- `promptTokens`, `completionTokens`, `totalTokens`;
- median duration и success count по каждой стратегии.

`large-file-small-edit` специально показывает цену full-file `edit` на более длинном файле.


Такой режим намеренно исключает шум filesystem/path/permissions из capability-оценки: benchmark измеряет связку `model -> Action contract -> applicator -> resulting content`.

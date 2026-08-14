# Benchmark и эксперименты

Этот документ описывает benchmark practice Nodus и сохраняет только ограниченный контекст прошлых наблюдений. Он не объявляет локальные результаты универсальными свойствами проекта или моделей.

## Что измеряем

Для каждого прогона полезно фиксировать:

- model и configuration, включая quantization, если она известна;
- scenario/task id;
- execution mode;
- число model calls;
- wall-clock duration;
- token metrics, если доступны;
- success/failure;
- contract/schema/apply failures;
- execution log;
- итоговое состояние изменённых файлов.

Model benchmarks запускаются последовательно (`concurrency=1`), если несколько прогонов конкурировали бы за один локальный endpoint/GPU.

Важно по возможности разделять разные capability:

- модель поняла требуемое semantic изменение;
- модель смогла выразить изменение в выбранном contract;
- технический edit применился;
- итоговое состояние семантически корректно.

Один exact expected output не должен автоматически считаться единственным корректным решением, если задача допускает эквивалентные реализации.

## Raw-agent control group

`target/benchmark/RawAgentBenchmark.ts` намеренно обходит Engine/Planner/Research/Worker orchestration и запускает свободный tool loop на той же model/project configuration. Это контрольная группа, а не correctness test Nodus.

Запуск:

```bash
npm run benchmark:raw-agent -- nodus.config.json
```

Подробности: [`../../target/benchmark/raw-agent.md`](../../target/benchmark/raw-agent.md).

## Model capability benchmark

`target/benchmark/model-capabilities` используется для более узких экспериментов с конкретными model capabilities, в частности с выражением изменений через разные Edit contracts. Его задача — отделять edit mechanics от Planner/Research noise, насколько это позволяет текущий harness.

Результаты конкретной модели не считаются глобальным рейтингом. Они нужны прежде всего для локального выбора и дальнейших runtime-гипотез.

## Исторические наблюдения

До текущей 0.3 архитектуры отдельные ручные прогоны `/status` показывали, что более ограниченный research/edit pipeline может заметно отличаться от свободного agent loop по времени и поведению. Эти наблюдения были одной из мотиваций дальнейшей работы, но не являются воспроизводимым benchmark evidence текущей версии и не должны использоваться как доказанная характеристика Nodus.

## TODO: стоимость языка внутренних запросов

Отдельный простой эксперимент — сравнить одинаковые machine-facing запросы при `language.nodus = en` и `language.nodus = ru`.

Для сравнения использовать одинаковые model/configuration, input data, response schema и sampling settings. Начать с небольших вызовов Planner, Determine, Worker attempt и Research.

Фиксировать:

- prompt tokens;
- completion tokens;
- total tokens;
- duration.

Не предполагать заранее конкретный коэффициент экономии: вывод должен следовать из измерений.

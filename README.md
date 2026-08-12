# Nodus 0.3

Nodus — экспериментальный runtime для управляемого coding-agent. Цель текущей ветки — вынести orchestration из модели и оставить LLM ограниченные, хорошо подготовленные решения.

## Структура

Основной код намеренно собран в три верхних слоя:

- `src/app` — composition root: конфигурация, DI, CLI, logger implementations и запуск Engine;
- `src/engine` — ядро Nodus: task lifecycle, project, Planner, Research и DefaultWorker;
- `src/model` — единая граница с LLM: adapters, `ModelRunner`, prompts, request/response formats, schemas и model tools.

Подробнее:

- [`src/app/APPLICATION.md`](src/app/APPLICATION.md)
- [`src/engine/ENGINE.md`](src/engine/ENGINE.md)
- [`src/model/MODEL.md`](src/model/MODEL.md)
- [`src/model/RESPONSE-FORMATS.md`](src/model/RESPONSE-FORMATS.md)
- [`test/TESTING.md`](test/TESTING.md)
- [`ROADMAP.md`](ROADMAP.md)

## Текущий runtime

`Engine.runTask()` координирует выполнение задачи. Он получает semantic plan от Planner и передаёт каждый `PlanStep` в `DefaultWorker`.

`DefaultWorker` агрегирует:

- `ExecutionPlanner` — выбирает следующее доступное действие;
- `ExecutionState` — хранит локальную историю выполнения шага;
- зарегистрированные `ExecutionAction` — реальные capabilities Worker.

В текущем vertical slice доступны `research` и `edit-file`.

Research — bounded knowledge service с hash-based cache. Cache entry считается актуальной, пока не изменился hash любого source-файла, участвовавшего в ответе.

Validation намеренно ещё не реализована как отдельный слой.

## Model layer

Все runtime-вызовы модели проходят через `ModelRunner`.

Adapter отвечает только за provider transport. `ModelRunner` принимает `message/data/guidance`, request format, response format + schema и per-call settings; наружу из model layer всегда возвращается JavaScript object. Для unified diff уже есть специализированный facade `ModelRunner.diffFile(...)`.

Сейчас model layer поддерживает `Text / Raw / Json / Diff` response formats и отдельные response schemas. Planner/ExecutionPlanner используют RAW + schema, Research — Text + schema, а edit-file идёт через `ModelRunner.diffFile()` и обычный unified diff.

Model-specific tools (`file-system`, `search`, `git`, `terminal`) снова находятся в `src/model/Tool`. Они пока не выдаются DefaultWorker автоматически: набор доступных capabilities должен задаваться явно.

## Запуск

```bash
npm install
cp nodus.config.example.json nodus.config.json
npm run build
npm run dev -- nodus.config.json
```

PowerShell:

```powershell
Copy-Item nodus.config.example.json nodus.config.json
```

## Тесты

Vitest установлен как npm dev dependency. Nodus-specific scenario harness находится отдельно в `test/framework`.

```bash
npm test
npm run test:unit
npm run test:integration
npm run test:model
npm run test:e2e
```

Каждый scenario run может использовать подменяемый logger. `TestFileLogger` пишет один timestamped `.log` на запуск; туда же через model harness попадают model request/response.

## Benchmark

Raw-agent control group сохранён отдельно от тестов:

```bash
npm run benchmark:raw-agent -- nodus.config.json
```

Описание: [`benchmark/RAW-AGENT.md`](benchmark/RAW-AGENT.md).

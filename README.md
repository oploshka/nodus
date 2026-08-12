# Nodus 0.3 — runtime spike

Экспериментальная сборка новой архитектуры без миграции старого `PlanExecutor`.
Цель spike — проверить границы `app / engine / model` и механику `Planner -> DefaultWorker -> ExecutionPlanner -> Action` на простом `/status` сценарии.

## Верхний уровень

```text
src/
  app/      composition root, configuration, console input
  engine/   логика выполнения задач
  model/    transport к LLM
```

`app` только собирает зависимости и запускает Engine. Внутренняя логика задачи в `app` не живёт.

## Engine

```text
engine/
  Engine.ts
  task/
  planner/
  project/
  research/
  worker/
```

### Engine

`Engine.runTask()` — координатор цикла:

1. создаёт Task;
2. получает semantic Plan от Planner;
3. отдаёт каждый PlanStep DefaultWorker;
4. собирает TaskRun;
5. останавливается при failed step.

Engine не выбирает action, не исследует проект и не редактирует файлы.

### Planner

Planner создаёт только смысловые шаги. Он не должен искать API, выбирать файлы или описывать patch mechanics.

### Research

`Research.ask(question)` работает как cached function над состоянием проекта:

- cache hit используется только если hash каждого source-файла совпадает;
- cache miss вызывает bounded resolver;
- ответ сохраняется вместе с source hashes.

В spike resolver намеренно простой: CPU выбирает небольшой список candidate files из ProjectIndex, затем модель отвечает по их содержимому. Свободного research-loop нет.

### DefaultWorker

DefaultWorker агрегирует:

- `ExecutionPlanner`;
- `ExecutionState`;
- зарегистрированный набор `ExecutionAction`.

Цикл:

```text
ExecutionState
-> ExecutionPlanner.next(state, actions)
-> Action
-> ActionResult
-> history/state
-> ExecutionPlanner.next(...)
```

Модель не получает произвольные tools. Она может выбрать только зарегистрированный Action.

В текущем spike доступны только:

- `research` — один ограниченный вопрос к Research;
- `edit-file` — одно сфокусированное изменение известного файла.

`edit-file` внутри себя отвечает за proposal -> parse diff -> CPU apply -> write. Это специально: patch/apply пока не выставлены как отдельные Actions, чтобы ExecutionPlanner не планировал инфраструктурную механику изменения файла.

## Что spike уже показал

1. `Engine` реально может оставаться тонким координатором.
2. Второй уровень планирования (`ExecutionPlanner`) естественно живёт внутри Worker.
3. Одного списка Actions недостаточно для контроля слабой модели: Worker должен жёстко ограничивать iterations и usage каждого Action.
4. Самая важная ещё не закрытая граница — **гранулярность Action**. На `/status` `research + edit-file` выглядят естественнее, чем `research + propose + apply + commit`.
5. `ExecutionState` пока может быть почти только history. Отдельная phase-machine не понадобилась.
6. Hash-based invalidation Research работает и не требует global project revision.
7. Cache сейчас консервативно зависит от всех файлов, прочитанных resolver'ом; позже стоит хранить более точные evidence dependencies.
8. Validation отсутствует намеренно. Сейчас `ExecutionPlanner` сообщает, что step завершён; это не считается доказательством корректности задачи.

## Проверки

В spike есть четыре теста:

- DefaultWorker выполняет action, выбранный ExecutionPlanner;
- per-action limit не даёт уйти в бесконечный research-loop;
- Research cache протухает после изменения hash source-файла;
- `/status` проходит полный scripted vertical slice: Engine -> Planner -> Worker -> Research -> EditFile -> completion.

Последний тест использует queue model adapter, поэтому проверяет архитектурный pipeline без зависимости от локальной LLM.

## Не решаем в этом spike

- Validation;
- pause/resume;
- Conversation;
- planning-time Research;
- multi-model routing;
- полноценный artifact/state model;
- выбор разных Worker-конфигураций;
- сложные multi-file edits.

Это намеренно: сначала проверяется механика выполнения одного semantic PlanStep.

## Testing

Тесты переведены на Vitest как npm dev dependency. Vitest отвечает за test runner, assertions, filtering и проекты; Nodus-specific сценарии остаются в собственном test harness.

```text
test/
  framework/      Nodus-specific test harness
  unit/           быстрые локальные тесты
  integration/    deterministic vertical slices со scripted model
  model/          реальные model-сценарии, последовательно
  e2e/            полный запуск через app/CLI/config
  logs/           единый trace-log каждого scenario run
```

`test/framework` содержит:

- `Scenario` — описание задачи, fixture-файлов и scripted model responses;
- `ScenarioRunner` — собирает временный проект через обычный `Bootstrap` и запускает `Engine.runTask()`;
- `TestProject` — временный project fixture;
- `QueueModelAdapter` / `LoggedModelAdapter` — deterministic и traced model harness;
- `TestFileLogger` — подменяемый Logger, который пишет весь trace одного scenario в один timestamped log-файл.

Пример имени лога:

```text
test/logs/2026-08-12T12-34-56-123Z_status.log
```

В этот же файл попадают обычные runtime events (`engine.*`, `worker.*`, `research.*`) и model request/response от test harness. Отдельной runtime-сущности `Trace` нет.

Vitest projects:

```text
npm test
npm run test:unit
npm run test:integration
npm run test:model
npm run test:e2e
```

`model` и `e2e` настроены без file-level parallelism; реальные model tests не должны конкурировать за локальный model endpoint.

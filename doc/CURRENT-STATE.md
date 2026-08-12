# Current state / handoff

Этот файл предназначен как короткая точка восстановления контекста при новом чате или после длинной паузы. Он описывает не историю всех решений, а текущее состояние spike и ближайшие незакрытые вопросы.

## Архитектурная модель

Три верхних слоя:

- `app` — startup/composition/CLI/logging;
- `engine` — task lifecycle, Planner, Determine, Research, Worker и Actions;
- `model` — единая граница с LLM/provider transport, response formats/schema, ModelRunner/ModelCaller и tools.

Основной путь:

```text
CLI/App
  -> Engine.run(task)
  -> Planner -> Plan
  -> Determine -> Worker
  -> Worker -> Action
       -> ChangeCodeAction
       -> ResearchAction when explicitly requested
  -> WorkerResult
  -> Engine reaction
```

Engine не должен знать внутреннюю механику Worker. Worker выполняет один `PlanStep` и координирует ограниченный набор доступных Actions. Action — исполняемая capability с собственным input/output contract; это не просто prompt description.

## Planner

Planner строит маленький semantic plan. `PlanStep` описывает outcome, explicit constraints и причину декомпозиции.

Используются фиксированные decomposition types:

- `coherent-outcome`;
- `independent-outcome`;
- `dependency`;
- `separate-deliverable`.

Файлы, слои, Research, validation и технические фазы не являются причиной делить задачу. Если отдельной причины нет, Planner должен вернуть один coherent step.

## Worker / Actions

Текущий `CodeWorker` работает через:

```text
change-code -> research (по запросу action) -> change-code retry
```

`ChangeCodeAction` может менять несколько файлов, если это одна связная задача. Он отвечает за proposal/edit list, diff generation, patch apply и локальный recovery конкретного edit.

`ResearchAction` вызывается только когда основной Action явно вернул конкретные missing-information requests. Research не запускается превентивно.

Worker возвращает Engine:

- `completed`;
- `not-completed` + `canContinue: true`;
- `failed`.

Настоящий resume/continue того же Worker пока не реализован.

## Research

Research — bounded service с persistent cache. Cache entry хранит source files + hashes и считается актуальной, пока эти hashes не изменились.

Текущий принцип:

```text
Research.ask(question)
  -> cache lookup
  -> validate source hashes
  -> hit: return cached answer
  -> stale/miss: resolve again
  -> persist resolved answer
```

`not-found` не кешируется.

## Project paths

Все пути между Engine/Worker/Action должны быть canonical project-root-relative paths, например:

```text
src/engine/Planner/ModelPlanner.ts
nodus.config.example.json
```

`ProjectPathResolver` принимает потенциально грязные model paths, нормализует абсолютные/file URL/decorated references, проверяет root boundary, существование файла для existing operations и умеет чинить неверный prefix через project index только при одном однозначном совпадении.

Hard write blocks сейчас: `node_modules` и `.git`. Project exclude rules также блокируют model writes, кроме временного исключения `.nodus` — см. planned work ниже.

## Model layer

Runtime model calls идут через `ModelRunner`; обычные engine components используют `ModelCaller`, который логирует полный `ModelRunResult` и возвращает только `data`.

Schema единая object-schema; operation-specific schema classes не используются. `option` используется вместо технического enum, когда модели нужно описание выбора.

`ModelRunner.diffFile(...)` — thin specialized facade над общим runner contract.

## Languages

Конфиг уже содержит три понятия:

```json
{
  "language": {
    "project": "en",
    "nodus": "en",
    "response": "ru"
  }
}
```

- `project` — язык human-authored docs/comments;
- `nodus` — внутренние Planner/Worker/Research/Determine данные;
- `response` — пользовательский вывод.

Сейчас enforcement частично живёт в prompts callers. Планируется перенести базовую language policy в model layer, чтобы internal language по умолчанию был English и не приходилось повторять правило в каждом Action/Service.

## CLI / logs

Multiline input:

- `Enter` — новая строка;
- `Ctrl+Enter` или `Ctrl+D` — submit;
- `Ctrl+C` — cancel input; на пустом input — exit;
- `/exit` остаётся явной командой.

Console показывает человекочитаемый progress с `[Engine] [Planner] [Model] [Research] [Worker]`. Полный model exchange и nested diagnostic payload пишутся в timestamped `.nodus/logs/*-nodus.log`.

Полезный запуск:

```bash
npm run dev -- nodus.config.json --clear-cache --clear-logs --scan
```

## Tests

Vitest projects:

- unit;
- integration;
- model;
- e2e.

Ключевые deterministic integration scenarios:

- `/status`;
- `runtime.maxPlanSteps`.

Их задача — фиксировать архитектурный проход и signatures, а не интеллект модели.

## Planned work / known issues

1. **Internal storage boundary.** Сейчас `.nodus` одновременно находится в project excludes и используется Nodus для Research cache/index/logs. Временно `.nodus` исключён из write-policy check, чтобы internal cache снова работал. Нужно разделить model-editable project paths и Nodus-owned internal storage отдельным API/storage boundary. После этого `.nodus` снова должен быть недоступен model Actions.
2. **Central language policy.** Перенести default internal language enforcement в model layer. `nodus` default — English; project/response меняются по config/use case.
3. **Worker continuation.** Реализовать настоящий `/continue`/Engine resume для `not-completed`, сохраняя instance/state, а не создавая новую user task.
4. **User interaction/control points.** Proposal approval, correction, async interrupt, `required/timeout/none`, configurable timeout action.
5. **Validation layer.** Пока намеренно отсутствует.
6. **Research precision.** Уточнить evidence dependencies: cache может зависеть от всех candidate files, а не только от реально использованных источников.
7. **Action growth.** После стабилизации `ResearchAction + ChangeCodeAction` рассмотреть `RunCommandAction`, documentation action и другие capabilities по реальным сценариям.
8. **AgentWorker semantics.** Различать настоящий completed от ответа модели вида «нужен пользовательский контекст».
9. **Experience data.** Продолжать логировать task/worker/action outcomes для будущего task clustering и более дешёвого Determine.

## Last observed test/debug state

Before the project write-policy change, unit and integration suites were green. The next integration run failed because Research successfully resolved answers but persistence of `.nodus/research-cache.json` was blocked by the new write policy. The temporary `.nodus` exemption in this snapshot addresses that specific regression; `npx tsc --noEmit`, unit and integration should be re-run locally to confirm the snapshot.

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
       -> ChangeCodeAction -> ProjectEditRequest
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

Текущий `CodeWorker` намеренно тестирует replace-стратегию и работает через:

```text
change-code -> research (по запросу action) -> change-code retry
```

`ChangeCodeAction` теперь описывает только semantic edits (`path + instruction`). Технические стратегии `range-replace`, `replace`, `diff` и full-file `edit` перенесены в `src/engine/Edit` и реализуют общий `EditStrategy` contract. Текущий Code Worker запрашивает `range-replace`, Documentation Worker — `diff`, но serialization и применение выполняет Engine-owned `ProjectEditor`.

Все edits одного Worker result сначала готовятся в памяти; несколько edits одного файла видят buffered результат предыдущего. Только полностью подготовленный набор проходит stale-source validation и atomic commit.

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

## Языки

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

- `project` — язык human-authored docs/comments и другого создаваемого человеком текста внутри проекта;
- `nodus` — язык всех machine-facing данных Planner/Determine/Worker/Action/Research, включая внутренние summary/reason и edit instructions;
- `response` — только текст, непосредственным потребителем которого является пользователь, а также локализация deterministic UI/console.

Язык выбирается по потребителю данных, а не по названию поля. Общие model-facing инструкции централизованы в `ModelLanguagePolicy`; конкретные prompts остаются у своих Planner/Action/Research компонентов.

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

## Планируемые работы / известные проблемы

1. **Internal storage boundary.** Сейчас `.nodus` одновременно находится в project excludes и используется Nodus для Research cache/index/logs. Временно `.nodus` исключён из write-policy check, чтобы internal cache снова работал. Нужно разделить model-editable project paths и Nodus-owned internal storage отдельным API/storage boundary. После этого `.nodus` снова должен быть недоступен model Actions.
2. **Central language policy.** Перенести default internal language enforcement в model layer. `nodus` default — English; project/response меняются по config/use case.
3. **Worker continuation.** Реализовать настоящий `/continue`/Engine resume для `not-completed`, сохраняя instance/state, а не создавая новую user task.
4. **User interaction/control points.** Proposal approval, correction, async interrupt, `required/timeout/none`, configurable timeout action.
5. **Validation layer.** Пока намеренно отсутствует.
6. **Research precision.** Уточнить evidence dependencies: cache может зависеть от всех candidate files, а не только от реально использованных источников.
7. **Edit routing.** После benchmark на mock project решить, как Engine Editor выбирает/fallback-ит между `range-replace`, `replace`, `diff` и full-file `edit`; Worker не должен владеть этой технической маршрутизацией.
8. **AgentWorker semantics.** Различать настоящий completed от ответа модели вида «нужен пользовательский контекст».
9. **Experience data.** Продолжать логировать task/worker/action outcomes для будущего task clustering и более дешёвого Determine.
10. **Worker Workspace / task-level commit (идея, не утверждена).** Рассмотреть модель, где Worker работает только с виртуальным `ProjectView`/Workspace, ChangeCode меняет buffered файлы, Research видит эти buffered версии, а Engine применяет итоговый ChangeSet к реальному Project только после успешного завершения всех PlanStep пользовательской задачи. Первый кандидат хранения — in-memory overlay; `.nodus/fileCache` рассматривать только при реальной необходимости persistence/spill/resume. Persistent Research cache поверх виртуального Workspace требует отдельной semantics/versioning.

## Последнее наблюдаемое состояние тестов/debug

До изменения project write-policy unit и integration suites были зелёными. Следующий integration run упал потому, что Research успешно получил ответы, но сохранение `.nodus/research-cache.json` было заблокировано новой write-policy. В этом snapshot для `.nodus` оставлено временное исключение; локально нужно повторно прогнать `npx tsc --noEmit`, unit и integration.


## Engine-owned Edit commit

Edit serialization и commit перенесены в `src/engine/Edit`. Worker возвращает semantic `ProjectEditRequest`; Engine-owned `ProjectEditor` готовит изменения выбранной стратегией, валидирует stale source и атомарно применяет набор. Virtual task-wide workspace остаётся будущим направлением.


## Validation

Engine теперь имеет отдельный Validation boundary после успешного выполнения шага. `PassValidator` всегда подтверждает результат и нужен только для фиксации слоя; реальные validation strategies пока не определены.


## Edit recovery

Technical edit failures are recovered inside the Engine-owned Edit layer. `range-replace` gets one bounded localization retry using the authoritative buffered file, the original semantic instruction, previous operations, and the applicator error. Worker is not rerun for this recovery.

If a strategy still cannot prepare the edit, `ProjectEditor` may fall back to another registered strategy while keeping the same semantic intent. The default chain is `range-replace -> diff -> edit`, `replace -> diff -> edit`, and `diff -> edit`. Preparation remains in memory; commit starts only after the complete coherent edit set is ready.

# Engine

`Engine.run()` координирует один task run. Он владеет исходным `Task`, global `Plan`, списком доступных Worker options и границами, где результат исполнения становится состоянием Project.

Для каждого `PlanStep` Engine:

1. выбирает compatible Worker через `Determine`;
2. передаёт Worker управление step;
3. получает `WorkerResult`;
4. если Worker подготовил semantic changes, передаёт их Engine-owned `ProjectEditor`;
5. после успешного Edit проходит Validation boundary;
6. реагирует на `completed / not-completed / failed` и решает, можно ли переходить к следующему step.

Engine не знает конкретные Research-вопросы Worker, внутренний порядок Actions или provider transport. Technical Edit mechanics при этом принадлежат Engine, а не Worker.

## Services

`Planner`, `Research` и `Determine` — bounded services с конкретным ожидаемым результатом. Они могут использовать модель, но не владеют всем task lifecycle.

`Determine` выбирает один option из ограниченного набора. Сейчас Engine использует его для Worker routing, но сервис не является Worker-specific abstraction.

`Research` отвечает на bounded project question и владеет persistent cache/hash invalidation. Он не является Worker и не запускается как обязательная стадия каждого шага.

## Worker results

- `completed` — Worker считает semantic работу PlanStep завершённой;
- `not-completed` — текущая попытка закончилась, но состояние потенциально пригодно для continuation;
- `failed` — execution path terminal.

Настоящий continuation API пока не реализован: новая пользовательская команда `продолжить` не является resume предыдущего Worker instance.

## Execution samples

Engine пишет execution samples и task statistics: task/step, candidates, выбранный Worker, outcomes, duration и доступные runtime metrics. Эти данные являются основой для будущих измерений Worker/Determine и model-capability экспериментов, но пока не образуют автоматическую execution policy.

## Edit ownership

Worker возвращает `ProjectEditRequest` с semantic `path + instruction` и может указать preferred strategy. `ProjectEditor`:

- получает authoritative source;
- применяет зарегистрированную `EditStrategy`;
- держит coherent multi-file state в памяти;
- выполняет technical recovery/fallback без повторного semantic reasoning Worker;
- проверяет target paths и stale source перед записью;
- начинает commit только после успешной подготовки полного набора;
- при ошибке записи выполняет best-effort rollback уже записанных файлов.

`range-replace`, exact `replace`, unified `diff` и full-file `edit` являются Engine EditStrategy, а не Worker Actions.

Task-wide virtual workspace пока не реализован. Это отдельный следующий уровень ownership, где Engine потенциально сможет коммитить изменения только после завершения всей Task.

## Validation

После Worker/Edit Engine проходит отдельную Validation boundary. Сейчас `PassValidator` только закрепляет lifecycle и всегда возвращает `passed`.

Реальные validators, failure/recovery semantics и связь с commit/workspace ещё открыты. Подробности: [`validation.md`](validation.md).

## Interaction / control points

Engine является естественной control boundary между автономным execution и пользователем. Proposal approval, correction, async interrupt, pause/resume и timeout semantics пока не являются завершённым runtime API и остаются отдельным направлением разработки.

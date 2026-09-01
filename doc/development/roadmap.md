# Nodus 0.5 roadmap

Roadmap фиксирует текущую рабочую точку 0.5 и порядок ближайших изменений. Он не является полным описанием архитектуры и не превращает research-гипотезы или возможности старого 0.4 runtime в обязательный план реализации.

Главный принцип текущего этапа: сначала довести рабочую вертикаль `Planner -> WorkerCode -> Actions -> Edit`, затем расширять её только по наблюдаемым failure cases. Не продолжать перенос старых abstractions ради структурного сходства с 0.4.

## Текущая рабочая точка

- [x] `EngineRuntime` исполняет mutable working `EngineSchema` и uniform `iEngineStep` modules.
- [x] Step может вернуть обычный output или вложенную `EngineSchema`; возвращённая schema сохраняется в `step.runtime.schema` и исполняется Core.
- [x] `input.context` декларирует `parent / previous / steps`, а разрешённый context хранится как removable `step.runtime.context`.
- [x] Step output остаётся частью working schema и может использоваться последующими шагами.
- [x] `transition` может менять только невыполненный хвост sequence; Core проверяет group/module boundaries.
- [x] Modules могут объявлять dependencies, которые Core регистрирует в namespace вида `RootModule::Dependency`.
- [x] Active automation регистрирует `Planner`, `WorkerCode` и конкретные Actions.
- [x] CLI проходит через рабочую вертикаль `ActionUserInputCli -> Planner -> WorkerCode -> Actions`.
- [x] `Engine` создаёт task-local `ProjectEditor`, передаёт его как runtime dependency и применяет накопленные изменения после успешного выполнения schema.
- [x] Runtime events привязаны к конкретному Step через scoped `emit`; `runtime.events` сохраняет execution-local события, внешний listener получает path/module/Step metadata.
- [x] Console и file output работают как subscribers event stream, а не как dependencies semantic modules.

## Ближайшие изменения

### 1. Довести WorkerCode до устойчивого контракта

`WorkerCode` уже является рабочей schema-orchestration вертикалью, но его `transitionChange()` всё ещё вынужден интерпретировать общий `ActionCoreResult` с `completed / not-completed / failed`, `canContinue`, `retry` и generic requests.

Следующий шаг — сделать контракт `ActionCodeChange` предметным для задачи изменения кода. Ориентир по смыслу:

- edit готов к применению;
- нужен дополнительный context;
- задача уже выполнена;
- выполнение невозможно / failed.

Конкретные имена result variants выбрать при реализации. Цель — не новая abstraction, а более читаемый state machine WorkerCode.

Worker должен оставаться владельцем orchestration: Action сообщает semantic need/result, Worker решает, какие следующие Steps построить, Core только исполняет schema. Не передавать `ActionCodeChange` ответственность за имена automation modules или построение всей execution schema без отдельного подтверждённого основания.

После изменения повторно оценить:

- retry semantics;
- request dedupe;
- limits;
- mapping context requests на `ActionFileFind / ActionFileRead / ActionResearch`;
- необходимость `ActionCoreResult` как общей сущности.

### 2. Сделать Planner настоящим Planner

Текущий `Planner` намеренно минимален и передаёт одну task в `WorkerCode`. Следующий Planner должен быть собран из полезного, уже находящегося в `automation/Step/Planner/`:

- текущего `Planner.ts` как active Step boundary;
- `PlannerTaskPrompt.md`;
- `PlannerTaskResponse.ts` и его semantic response contract;
- других очевидно полезных частей текущего Planner automation.

Не пытаться в этом проходе полностью восстановить старый 0.4 Planner lifecycle, Qualifier или Determine. Отдельно провести functional snapshot 0.4 и проверить, какие возможности действительно были ценны: [`../research/0.4-functional-snapshot.md`](../research/0.4-functional-snapshot.md).

`PlannerTask` пока не удалять только потому, что он не зарегистрирован в active automation. Его нужно переписать/поглотить новым Planner, но полезное содержимое должно быть извлечено осознанно.

Первый законченный Planner 0.5 должен уметь превратить пользовательскую task в один или несколько semantic outcomes для Worker, не декомпозируя задачу механически по файлам, тестам или техническим фазам.

### 3. Пересмотреть events / logging

Текущий event path уже полезнее старого Logger/Presentation wiring, но остаётся переходным.

Сейчас одновременно существуют:

- Core lifecycle events `step.start / step.finish / step.error`;
- subsystem events вроде `model.start / model.finish / model.error` и `edit.*`;
- hard-coded interpretation этих event names внутри `ConsoleEventSubscriber`;
- специальные правила вроде скрытого `step.finish` и различия между handled `FAILURE` output и thrown `step.error`.

После стабилизации WorkerCode и Planner провести отдельный cleanup, не смешивая его с их semantic refactor.

Нужно проверить:

1. какие lifecycle events обязан генерировать runner/Core автоматически;
2. какие события принадлежат Model/Edit/Project и должны приходить только через `emit`;
3. достаточно ли текущих `start / finish / error` или names/status semantics стоит упростить;
4. как различать handled failure, terminal failure и exception без console-specific костылей;
5. должен ли Console знать конкретные event names или ему нужен более устойчивый event contract;
6. какие данные должны оставаться в `step.runtime.events` для debug/replay и какие нужны только live subscribers;
7. как сохранить правило: event содержит execution data, presentation/identity берутся из Step metadata или metadata соответствующей subsystem.

Цель — не создать большую event hierarchy, а убрать остатки старой logging semantics из новой модели.

### 4. Проверить multi-step task lifecycle

После настоящего Planner проверить реальную цепочку с несколькими Worker outcomes через один task-local Edit:

```text
Planner
  -> Worker A
  -> Worker B
  -> ...
  -> apply
```

На этом сценарии определить только реально необходимые semantics:

- видимость накопленных изменений последующим Worker;
- failure одного из последующих outcomes;
- checkpoint/restore, если он действительно нужен;
- structural replan;
- context между Worker steps;
- partial apply / user decision.

Не возвращать старые механизмы 0.4 автоматически только потому, что они существовали.

### 5. Вернуть project-level verification по фактической необходимости

В текущем 0.5 active path `Engine.run()` после успешного runtime применяет `ProjectEditor`; старый `EngineTest` lifecycle больше не является фактическим active path.

После появления multi-step Planner отдельно решить минимальный post-apply verification contract на реальных сценариях. Исторические `EngineTest`/Validation implementations использовать как источник опыта, а не как compatibility requirement.

## Отдельный research: functional snapshot 0.4

До удаления потенциально полезных исторических Planner/Worker/Research artifacts провести отдельную инвентаризацию Nodus 0.4: [`../research/0.4-functional-snapshot.md`](../research/0.4-functional-snapshot.md).

Исследование должно сравнивать наблюдаемое поведение, а не классы и названия. Только подтверждённые полезные свойства возвращаются в active roadmap.

## Отложенные направления

Эти темы остаются реальными, но пока не должны вытеснять Worker/Planner/events вертикаль без нового failure case:

- Research v2 и более точная task-local cache/hash semantics;
- Qualifier / Determine как отдельные Step roles;
- sophisticated invalidation `runtime.context` после изменения working schema;
- AutomationLoader evolution и schema/config version compatibility;
- replay/debug UI поверх `runtime.schema` и `runtime.events`;
- Project Understanding representations сверх текущих подтверждённых use cases;
- create/delete/move в task-local Edit;
- user interaction/control points: approval, correction, interrupt, pause/resume, timeout;
- partial apply;
- Agent Worker evolution;
- model capability measurements и task statistics v2.

## Правило перехода от refactor к развитию

Рефакторинг 0.5 можно считать в основном завершённым, когда:

1. `WorkerCode` имеет понятный предметный execution contract;
2. `Planner` реально строит semantic execution schema, используя полезные active Planner assets;
3. несколько Planner outcomes проходят через один task-level lifecycle без возврата к старому production loop;
4. event/logging boundary не требует legacy Presentation/Logger semantics для объяснения нормального выполнения.

После этого дальнейшие Qualifier/Research/verification/replan изменения следует рассматривать как развитие Nodus 0.5, а не как обязательную миграцию 0.4.

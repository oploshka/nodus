# Текущее состояние / handoff

Этот документ — короткая точка восстановления контекста. Он описывает фактический active path Nodus 0.5 на `develop`, а не историю всех архитектурных решений и не целевую идеальную архитектуру.

Если специализированный architecture-документ противоречит этому handoff в области текущей миграции 0.5, сначала проверять active code. Часть Planner/Worker/Research/EngineTest документации ещё содержит полезное описание 0.4 boundaries и требует постепенного обновления.

## Архитектурная модель

Верхние слои:

- `app` — startup/composition, CLI, concrete event subscribers и project/model wiring;
- `engine` — schema execution Core, Step contracts, task-level Edit и Project mechanics;
- `model` — LLM/provider transport, request/response formats, `ModelRunner`/`ModelCaller` и model capabilities;
- `automation` — конкретная versioned поставка Planner/Worker/Action behavior поверх Engine contracts.

Nodus 0.5 перешёл от старого fixed Planner/Worker production loop к schema-driven execution Core. Основной active runtime находится в `src/engine/Core/`.

## Core / EngineSchema

Активный Core состоит вокруг:

- `EngineRuntime` — регистрация modules, проверка group boundaries и исполнение working schema;
- `EngineSchema` — mutable working execution schema и context resolution;
- `EngineStep` / `iEngineStep` — единый module contract;
- `AutomationLoader` — загрузка versioned `automation` package.

Текущий schema node имеет один structural type `SEQUENCE`. Узел может:

- ссылаться на module через `module`;
- содержать вложенную local chain через `steps`;
- иметь semantic `task`;
- запросить context через `input.context`;
- хранить `output`;
- изменить невыполненный хвост через `transition`.

Module Step возвращает либо `sEngineOutput`, либо новую `EngineSchema`. Если возвращена schema, Core:

1. сохраняет её chain в `step.runtime.schema`;
2. проверяет разрешённые group/module boundaries;
3. исполняет её как вложенную sequence;
4. возвращает итоговый output родительскому Step.

`transition` разрешено менять только ещё не выполненный хвост sequence. Завершённые Steps являются immutable execution history.

## Context и runtime state

`input.context` сейчас поддерживает:

- `parent`;
- `previous`;
- explicit `steps`.

Разрешённый Core context сохраняется в `step.runtime.context`.

`runtime` — execution-only state, которое можно удалить и восстановить/пересчитать из working schema и текущего выполнения. Сейчас там находятся:

- resolved `context`;
- локальные `events` Step;
- `schema`, возвращённая module во время исполнения.

`output` намеренно остаётся вне `runtime`: это фактический результат Step и часть working schema, которую могут читать последующие Steps.

Сложная invalidation/recompute policy для `runtime.context` после структурных изменений schema пока не реализуется заранее; текущую семантику следует усложнять только по реальному failure case.

## Step contract

Для active modules используется один `iEngineStep` interface:

```text
getId()
getGroup()
getMetadata()
getDependencies()
run(step, dependencies)
```

Runtime/application dependencies передаются только в `run()` и не записываются в schema/context.

`getDependencies()` позволяет module объявить concrete child modules. Core разворачивает их при регистрации в namespace:

```text
RootModule::Dependency
```

Один и тот же dependency implementation может быть доступен в разных module namespaces. Schema существует внутри конкретной конфигурации продукта; переносимость между несовместимыми automation packages не является обязанностью Core.

`src/engine/Step/` содержит thin role classes для `Planner`, `Worker`, `Action`, `Research`, `Qualifier`. Они в основном задают group/metadata defaults поверх общего Engine Step contract; отдельной runtime-механики Runner для каждой группы сейчас нет.

`StepWorker` дополнительно хранит declared child dependencies и предоставляет canonical dependency module name через Worker id. Это позволяет concrete Worker владеть своими Actions, не регистрируя их как глобальные root modules.

## Active automation

`automation/index.js` сейчас регистрирует только root modules:

- `Planner`;
- `WorkerCode`.

Concrete Actions принадлежат `WorkerCode` как dependencies. Core регистрирует их в namespace:

```text
WorkerCode::ActionCodeChange
WorkerCode::ActionFileFind
WorkerCode::ActionFileRead
WorkerCode::ActionResearch
WorkerCode::ActionEditApply
```

Group config отдельно задаёт, какие группы могут возвращать schema, а root `modules` содержит только independently addressable modules текущей automation.

Текущая рабочая вертикаль:

```text
ActionUserInputCli
  -> Planner
  -> WorkerCode
  -> WorkerCode::ActionCodeChange
       -> при необходимости WorkerCode::ActionFileFind / ActionFileRead / ActionResearch
       -> повторный WorkerCode::ActionCodeChange
       -> WorkerCode::ActionEditApply
```

Она уже проходит end-to-end на простых code-edit задачах.

## Planner

Active `automation/Step/Planner/Planner.ts` сейчас намеренно минимален: получает task и возвращает `EngineSchema` с одним `WorkerCode(task)`.

Это bootstrap implementation, а не законченный Planner 0.5.

В `automation/Step/Planner/PlannerTask/` уже существуют prompt/response assets и часть semantic planning policy, но `PlannerTask` не является зарегистрированным active module и содержит переходные зависимости от старого мира. Его не следует считать current Planner contract.

Следующий Planner должен быть собран из полезных частей текущего `automation/Step/Planner`, не восстанавливая весь 0.4 lifecycle автоматически.

Отдельно запланирован functional snapshot 0.4, чтобы понять, какие Planner/Qualifier/Determine и другие свойства действительно были ценны: [`../research/0.4-functional-snapshot.md`](../research/0.4-functional-snapshot.md).

## WorkerCode / Actions

`WorkerCode` — главный текущий schema-orchestration module code-edit vertical.

Он владеет concrete Action instances и использует их только через собственный dependency namespace. Root automation не адресует эти Actions напрямую.

WorkerCode:

- запускает `ActionCodeChange`;
- интерпретирует semantic result;
- при missing context добавляет `find-file / read-file / research` Steps;
- передаёт выбранный previous context следующей попытке;
- ограничивает attempts и retrieval requests;
- выполняет dedupe уже запрошенного context;
- при готовом edit добавляет `ActionEditApply`.

Эта логика выражена через working sequence + `transition`; отдельный старый `WorkerIterativeRunner` больше не является active runtime contract.

Главный незакрытый Worker refactor: `ActionCodeChange` всё ещё возвращает общий `ActionCoreResult` (`completed / not-completed / failed`, `canContinue`, `requests`, `retry`). Из-за этого `WorkerCode.transitionChange()` содержит лишнюю generic interpretation logic.

Следующий шаг — сделать предметный ChangeCode result и оставить ясное разделение:

```text
Action -> сообщает semantic result / need
WorkerCode -> строит следующий execution path
Core -> исполняет schema
```

## Engine-owned Edit

`Engine.run()` создаёт один `ProjectEditor` на конкретный run, если доступны `target.fileSystem`, `model` и `language`, и передаёт его module-ам как runtime dependency `edit`.

`ProjectEditor` хранит task-local accumulated changes до физического commit. Active Engine wiring сейчас использует стратегии:

- `range-replace`;
- unified `diff`.

Другие Edit strategies/validators могут существовать в кодовой базе, но не все являются частью текущего default Engine wiring.

После успешного завершения `EngineRuntime` текущий `Engine` вызывает `edit.apply()` один раз. Если apply неуспешен, итоговый Engine result становится `FAILURE`.

Старый production lifecycle с явным PlanStep checkpoint/restore и обязательным `EngineTest.run()` после apply больше не является фактическим active path 0.5. Эти механизмы следует рассматривать как исторический опыт и возвращать только при подтверждённой необходимости.

## Events / logging

Новая event-модель уже является active path, но пока остаётся переходной и требует отдельного cleanup после WorkerCode/Planner.

Перед каждым module run `EngineRuntime` создаёт scoped `emit`, привязанный к конкретному schema path. Событие:

- сохраняется в `step.runtime.events`;
- передаётся внешнему listener в envelope с `path`, `module`, `schemaStep` и concrete `step`;
- не содержит Presentation object.

Core автоматически генерирует:

- `step.start`;
- `step.finish`;
- `step.error` для thrown exception.

Model/Edit/Project и другие подсистемы могут публиковать собственные events через тот же `emit`, например `model.start / model.finish / model.error` и `edit.*`.

`Step.getMetadata()` хранит стабильную presentation identity Step (`code`, `title`, `description`, `color`). Console/File находятся в `app` и являются subscribers event stream.

Текущий `ConsoleEventSubscriber` всё ещё hard-code'ит конкретные event names и специальные правила отображения. Например `step.finish` обычно скрывается, handled `FAILURE` output не показывается как terminal error, а thrown exception приходит как `step.error`.

Это рабочая, но не окончательная event/logging semantics. После стабилизации WorkerCode и Planner нужно отдельно проверить ownership lifecycle events, failure semantics и границу между generic event data и console rendering.

## CLI / composition

`Main.ts`:

1. загружает config;
2. создаёт model и Project;
3. загружает `automation/{groups, modules}`;
4. добавляет app-owned `ActionUserInputCli` и group `cli`;
5. создаёт `Engine`;
6. запускает root schema с одним `ActionUserInputCli`.

`ActionUserInputCli.run()` ожидает пользовательский input и возвращает вложенную `EngineSchema([Planner(task)])`. Поэтому CLI input является реальным первым Step процесса, а Planner запускается как возвращённая schema, без искусственного дублирования task через соседний Step.

## Project Understanding

`src/engine/Project/` остаётся отдельной линией развития. Не следует создавать один универсальный `ProjectState` или расширять Project Understanding в RAG/Graph/Tree только ради полноты.

Новые representations должны появляться под конкретный use case и иметь собственный lifecycle/ownership.

## Что сейчас не считать active contract

Следующие идеи могут оставаться в старых docs/history/code, но не должны автоматически направлять новый refactor:

- fixed production `Planner -> Determine -> Worker` loop 0.4;
- старый `PlanStep` lifecycle;
- `WorkerIterativeRunner` как обязательный Worker runtime;
- bounded Research service/cache как текущая обязательная implementation;
- обязательный `EngineTest` после каждого successful apply;
- старый Presentation/Logger object wiring;
- прежние `WorkerSchema / WorkerMethod` dual contracts, если они отсутствуют в active Step interface.

Их функциональную ценность нужно оценивать отдельно от старой формы реализации.

## Ближайший порядок работы

1. стабилизировать предметный contract `WorkerCode <-> ActionCodeChange`;
2. сделать настоящий Planner, скрестив полезные active assets из `automation/Step/Planner`;
3. отдельным проходом пересмотреть events/logging (`step.*`, `model.*`, handled failure vs error, console contract);
4. проверить multi-step Planner lifecycle через один task-local Edit;
5. только после реальных сценариев решать checkpoint/replan/verification/partial apply;
6. отдельно провести functional snapshot Nodus 0.4 и вернуть в roadmap только подтверждённо полезное поведение.

Подробный порядок: [`../development/roadmap.md`](../development/roadmap.md).

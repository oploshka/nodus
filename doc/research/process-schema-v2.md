# Process schema v2 — рабочий контракт

**Статус:** экспериментальный contract automation runtime.

Core является ограничителем и единственным исполнителем process schema. Planner и Worker могут вернуть Core новую локальную schema, но не исполняют её самостоятельно.

Исполняющая механика живёт в `src/engine/Process`; `src/engine/Automation` отвечает только за загрузку versioned automation behavior.

## STEP

Фиксированный язык исполнения живёт в Core:

```ts
enum STEP {
  SEQUENCE = 'SEQUENCE',
  QUALIFY = 'QUALIFY',
  PLAN = 'PLAN',
  WORKER = 'WORKER',
  ACTION = 'ACTION',
  VALIDATE = 'VALIDATE',
  REPLAN = 'REPLAN',
}
```

Набор STEP сейчас не расширяется automation-конфигурацией.

Конкретные Action ids не являются Core enum:

```js
{
  type: STEP.ACTION,
  action: 'ASK_USER',
}
```

Action находится на уровне `Process/Action`. Worker определяет, какие Actions ему нужны, но Action не является внутренним типом Worker.

## Ответ модуля Core

Core опрашивает module через единый контракт:

```ts
enum MODULE_RESULT {
  OUTPUT = 'OUTPUT',
  SCHEMA = 'SCHEMA',
}
```

Module возвращает либо готовый output, либо локальную schema.

При `SCHEMA` Core сохраняет schema рядом с вызвавшим executable step, исполняет её сам и записывает итог вложенной schema как `output` вызвавшего step.

Ожидаемый характер модулей:

```text
Planner -> чаще SCHEMA
Worker  -> OUTPUT | SCHEMA
Action  -> чаще OUTPUT
```

## Локальная SEQUENCE

Каждая `SEQUENCE` — отдельная локальная цепочка с нумерацией от `1`.

Model-facing контекст шага остаётся простым:

```js
input: {
  context: {
    parent: true,
    previous: true,
    steps: [1, 2],
  },
}
```

Runtime отклоняет ссылки на текущие, будущие и несуществующие local steps. Вложенная schema не получает автоматический доступ к внешним уровням.

### StepRef

Числа в persisted schema не являются runtime-ссылками. После проверки Core резолвит каждый выбранный local step в `ProcessStepRef`:

```text
1 -> ProcessStepRef(actual step object)
2 -> ProcessStepRef(actual step object)
```

`ProcessStepRef` существует только под капотом и отдаёт output реального выполненного объекта. Модель продолжает писать `steps: [1, 2]` и ничего не знает о ссылочном представлении Runtime.

## Output

Результат хранится рядом с выполнившимся step:

```ts
interface sProcessOutput {
  status: 'SUCCESS' | 'FAILURE';
  value?: unknown;
  reason?: string;
}
```

У executable step дополнительно может появиться `schema` — это schema, которую module вернул Core.

Успешная `SEQUENCE` возвращает копию output последнего локального step. Core не объединяет semantic outputs и не пытается самостоятельно писать summary.

## transition

После завершения step automation может определить `transition(plan, step)`. Runtime разрешает менять только хвост после выполненного step. Completed prefix остаётся неизменяемым.

## QualifierTask

`SIMPLE/MULTI/PROCESS` не являются Core contract. Это vocabulary конкретного `QualifierTask` и хранится рядом с ним.

Текущая квалификация может быть заменена другим classifier vocabulary без изменения Core.

## PlannerTask

Planner выбирается через Core `PlannerResolver`.

```text
0 planners  -> error
1 planner   -> use it
>1 planners -> error until selection policy exists
```

Стартовая внутренняя schema `PlannerTask`:

```text
QUALIFY
  ├─ SIMPLE  -> WORKER
  ├─ MULTI   -> PLAN
  └─ PROCESS -> PLAN
```

`PLAN` возвращает `MODULE_RESULT.SCHEMA`; Core исполняет semantic steps как вложенную schema PLAN step.

Главная граница:

```text
Planner decides what work/schema to produce
Core validates and executes schema
Worker may execute directly or return another schema
```

Planner не должен создавать `STEP.ACTION`: operational Actions принадлежат Worker на уровне выбора доступных capabilities, но сами Action являются Process primitives.

## Worker

Core Worker API больше не предполагает, что каждый Worker реализует один и тот же способ выполнения.

Concrete Worker живёт в `automation/` и через `getImplementation()` сообщает один из двух вариантов:

```text
SCHEMA -> local Process schema
METHOD -> custom run(request)
```

Core contract:

```text
Process/Worker/
  WorkerSchema.ts
  WorkerMethod.ts
  WorkerRunner.ts
  WorkerTsType.ts
```

`WorkerSchema` — abstract base для schema-driven Worker. Concrete Worker реализует `getId()` и `getSchema()`; `getImplementation()` возвращает `{ type: SCHEMA, schema }`.

`WorkerMethod` — abstract base для custom JavaScript/TypeScript Worker. Concrete Worker реализует `getId()` и `run(request)`; `getImplementation()` возвращает `{ type: METHOD, method }`.

`WorkerRunner` — concrete Process adapter, а не родитель Worker. Он связывает `STEP.WORKER` с task/context и выбирает execution path по implementation type:

```text
STEP.WORKER
  -> WorkerRunner
  -> getImplementation()
       -> SCHEMA -> MODULE_RESULT.SCHEMA -> ProcessRuntime
       -> METHOD -> run(request)
```

Core остаётся единственным исполнителем schema. Worker, который выбрал `SCHEMA`, не запускает её самостоятельно.

Production compatibility path пока отдельно использует Core `IterativeWorker` для code/documentation execution. Concrete `WorkerCode` и `WorkerDocumentation` уже вынесены в `automation/`, но `WorkerCode` будет переведён на schema-driven форму только после фиксации реальной полезной Worker schema. Agent loop вынесен в generic Core `WorkerAgentRunner`, а concrete `WorkerAgent` живёт в automation.

Жёсткий security sandbox по списку Actions пока не вводится.

## Failure / REPLAN

Failed step остаётся в process document с `status: FAILURE`.

Если transition после failure действительно заменил хвост, Runtime может продолжить через `REPLAN`.

`REPLAN`, как и `PLAN`, может вернуть `SCHEMA`. Core сохраняет и исполняет её на месте REPLAN step.

## Engine structure

```text
src/engine/
  Process/
    Process/
      ProcessRuntime.ts
      ProcessSchema.ts
      ProcessScope.ts
      ProcessTsType.ts
      Kit/
        ProcessStepRef.ts

    Action/
      Action.ts

    Worker/
      WorkerSchema.ts
      WorkerMethod.ts
      WorkerRunner.ts
      WorkerAgentRunner.ts
      WorkerTsType.ts
      IterativeWorker.ts

    Planner/
      PlannerResolver.ts
      PlannerModule.ts
      PlannerTsType.ts

  Automation/
    AutomationLoader.ts
```

Файлы `*TsType.ts` используются как технические контейнеры TypeScript contracts, чтобы не смешивать их с одноимёнными предметными `Type`.

## Automation structure

Automation группируется по механизмам:

```text
automation/
  Planner/
  Qualifier/
  Worker/
    WorkerCode/
    WorkerDocumentation/
    WorkerAgent/
  index.js
  package.json
```

Concrete Workers являются подключаемыми class modules. Core определяет contracts и execution mechanics; automation определяет конкретное versioned поведение.

Markdown prompts и JS response contracts находятся рядом с механизмом.

Для cross-module imports automation package использует native Node alias:

```js
import QualifierTask from '#automation/Qualifier/QualifierTask/QualifierTask.js';
```

## Тестовая стратегия

Runtime тестируется детерминированно готовыми schemas и fake modules. Отдельно проверяются module `OUTPUT`, module `SCHEMA`, `ProcessStepRef`, local context, immutable completed prefix, failure -> REPLAN schema, PlannerResolver, WorkerRunner routing и PlannerTask routing.

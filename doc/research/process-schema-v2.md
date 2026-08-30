# Process schema v2 — рабочий контракт

**Статус:** экспериментальный contract automation runtime.

Core является ограничителем и единственным исполнителем process schema. Planner и Worker могут вернуть Core новую локальную schema, но не исполняют её самостоятельно.

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

Worker определяет, какие Actions ему нужны.

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

Контекст шага:

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

`SEQUENCE.output` формируется Core как локальный text summary semantic outputs. `QUALIFY` в summary не включается.

## transition

После завершения step automation может определить `transition(plan, step)`. Runtime разрешает менять только хвост после выполненного step. Completed prefix остаётся неизменяемым.

## QualifierTask

`SIMPLE/MULTI/PROCESS` больше не являются Core contract. Это vocabulary конкретного `QualifierTask` и хранится рядом с ним.

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

Planner не должен создавать `STEP.ACTION`: operational Actions принадлежат Worker.

## Worker

Worker остаётся локально автономным. Он может вернуть `OUTPUT` или `SCHEMA`.

Конкретный Worker colocates config, prompt и response contract:

```text
automation/
  Worker/
    WorkerCode/
      WorkerCode.js
      WorkerCodePrompt.md
      WorkerCodeResponse.js
```

Worker также объявляет нужный ему набор Actions. Жёсткий security sandbox по этому списку пока не вводится.

## Failure / REPLAN

Failed step остаётся в process document с `status: FAILURE`.

Если transition после failure действительно заменил хвост, Runtime может продолжить через `REPLAN`.

`REPLAN`, как и `PLAN`, может вернуть `SCHEMA`. Core сохраняет и исполняет её на месте REPLAN step.

## Automation structure

Automation группируется по механизмам:

```text
automation/
  Planner/
  Qualifier/
  Worker/
  index.js
  package.json
```

Markdown prompts и JS response contracts находятся рядом с механизмом.

Для cross-module imports automation package использует native Node alias:

```js
import QualifierTask from '#automation/Qualifier/QualifierTask/QualifierTask.js';
```

## Тестовая стратегия

Runtime тестируется детерминированно готовыми schemas и fake modules. Отдельно проверяются module `OUTPUT`, module `SCHEMA`, local context, immutable completed prefix, failure -> REPLAN schema, PlannerResolver и PlannerTask routing.

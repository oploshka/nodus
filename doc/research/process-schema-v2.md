# Process schema v2 — рабочий контракт

**Статус:** реализован в automation runtime prototype. Контракт всё ещё экспериментальный и не обещает обратную совместимость.

Цель — сделать schema самодостаточным, редактируемым и версионируемым документом. Runtime исполняет переданную schema шаг за шагом; Planner и Replan не создают отдельный скрытый plan, а через `transition` изменяют хвост текущей локальной цепочки.

## Базовая модель

В перспективе process document может иметь верхний контейнер:

```js
{
  data: {},
  schema: {},
}
```

Точная структура `data` пока не фиксируется. Текущий prototype работает непосредственно с `schema` и входом root sequence.

Model-facing шагам не нужны обязательные `id`. Runtime использует локальную нумерацию и может держать технический path только для trace/debugging.

## STEP

`type` отвечает за семантику шага:

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

`ACTION` — конкретная Core-операция. Например пользовательский ввод может быть обычным Action:

```ts
enum ACTION {
  ASK_USER = 'ASK_USER',
}
```

```js
{
  type: STEP.ACTION,
  action: ACTION.ASK_USER,
}
```

При этом Planner сейчас **не имеет права строить semantic plan через ACTION**. Operational Actions принадлежат Worker. `ASK_USER` пока фиксируется как доступная capability для hand-authored/runtime schemas; отдельную policy для разрешённых orchestration Actions в model-generated plan можно добавить позже при реальном кейсе.

## Локальная SEQUENCE

Каждая `SEQUENCE` — отдельная локальная цепочка:

```text
STEP 1
STEP 2
STEP 3
...
```

Во вложенной sequence нумерация снова начинается с `1`.

Шаг может содержать самодостаточную semantic task:

```js
{
  type: STEP.WORKER,
  task: 'Сравнить три уже исследованных варианта и выбрать лучший.',
}
```

## Input context

Контекст вынесен в отдельную группу:

```js
input: {
  context: {
    parent: true,
    previous: true,
    steps: [1, 2],
  },
}
```

Модель при формировании шага отвечает на три простых вопроса:

- `parent` — нужен ли полный вход непосредственного родителя;
- `previous` — нужен ли полный output непосредственно предыдущего шага;
- `steps` — outputs каких ещё уже выполненных шагов текущей локальной sequence нужны.

Дублирование допустимо. Runtime не требует от модели вычислять, совпадает ли `previous` с одним из явно выбранных `steps`.

Runtime отклоняет ссылки на текущий, будущий или несуществующий local step.

### Жёсткая граница родителя

Для шага `3.2.1` `parent` означает строго `3.2`.

Дочерняя sequence не получает автоматического доступа к внешней ветке. Если дочерней работе нужны дополнительные знания, родитель должен получить их сам и сформировать самодостаточный child task/input.

## Output без отдельного step state

Отдельный persisted lifecycle state (`PENDING/RUNNING/...`) пока не нужен. Runtime и так знает текущий исполняемый шаг.

Результат хранится рядом с выполненным шагом:

```ts
interface sProcessOutput {
  status: 'SUCCESS' | 'FAILURE';
  value?: unknown;
  reason?: string;
}
```

`value` для model-facing работы обычно должен быть простым текстом. Если модуль внутри получил сложную структуру, он может нормализовать её в текст.

Позже `output` можно расширить: usage/resources, параметры запроса, timing, структурированный response и другие данные. Для этого не нужен отдельный state object.

`SEQUENCE.output` сейчас наследует итоговое значение последнего шага. Практический паттерн — делать последний шаг sequence итоговым summary, тогда родитель получает компактный результат вместо внутренних деталей.

## Planner как schema

Planner больше не рассматривается как один скрытый Core-монолит. Это переиспользуемая schema, внутри которой есть как минимум `QUALIFY` и при необходимости `PLAN`.

Классификация:

```ts
enum TASK_TYPE {
  SIMPLE = 'SIMPLE',
  MULTI = 'MULTI',
  PROCESS = 'PROCESS',
}
```

Семантика:

```text
QUALIFY
  ├─ SIMPLE  -> WORKER
  ├─ MULTI   -> PLAN -> nested SEQUENCE
  └─ PROCESS -> PLAN -> nested SEQUENCE
```

- `SIMPLE` — один Worker может владеть задачей как одним semantic outcome, даже если внутри понадобится много Actions.
- `MULTI` — нужны несколько самостоятельных semantic outcomes.
- `PROCESS` — пользователь уже задал существенную цепочку/порядок исполнения, который надо представить schema.

Главная граница:

```text
Planner plans semantic tasks
Worker plans operational Actions
```

Поэтому `PLAN` не должен генерировать `STEP.ACTION`.

## transition

После выполнения шага schema может определить обычную JS-функцию:

```js
transition: (plan, step) => {
  // plan — только SEQUENCE текущей вложенности
  // step — one-based номер только что выполненного шага
}
```

Функцию пишет автор automation schema, не модель. Модель возвращает только ограниченный структурированный output.

`transition` может изменять только хвост после выполненного шага. Runtime проверяет, что completed prefix не был заменён/удалён.

Пример маршрутизации qualifier:

```js
{
  type: STEP.QUALIFY,
  transition: (plan, step) => {
    const type = plan.steps[step - 1].output.value;

    if (type === TASK_TYPE.SIMPLE) {
      plan.steps.splice(step, plan.steps.length - step, {
        type: STEP.WORKER,
        input: { context: { parent: true } },
      });
    }
  },
}
```

Для `MULTI/PROCESS` qualifier добавляет `STEP.PLAN`. После PLAN его transition помещает результат в новую nested `SEQUENCE`, чтобы semantic task numbering снова начиналась с `1` и ссылки `steps: [1, 2, 3]` не смешивались с внутренними шагами Planner.

## Failure и Replan

Failed step считается уже выполненным. Его `output.status = FAILURE` и `reason` остаются рядом с шагом.

Schema может заменить оставшийся хвост на `REPLAN`:

```text
STEP 1  WORKER    ✓
STEP 2  VALIDATE  ✗
STEP 3  REPLAN    ✓
STEP 4  SEQUENCE
        ├─ STEP 1 repair
        └─ STEP 2 validate
```

`REPLAN` получает `parent` текущей sequence и failed `previous`. Replan возвращает новый semantic tail, который transition помещает в nested local sequence.

Упрощённая политика v0:

1. выполненный prefix неизменяем;
2. failed step остаётся частью истории;
3. Replan всегда переписывает только невыполненный хвост;
4. никаких model-generated global ids;
5. новая repair sequence снова использует локальные номера с `1`.

## ACTION.ASK_USER

Пользовательский ввод не требует отдельного `STEP.USER`. Это обычный Action:

```js
{
  type: STEP.ACTION,
  action: ACTION.ASK_USER,
  input: {
    context: {
      parent: true,
      previous: true,
    },
  },
}
```

Существующая идея Human boundary при ошибках/неоднозначности может быть реализована этим механизмом. Реальный adapter взаимодействия с пользователем пока не входит в prototype.

## Тестовая стратегия

Основной способ тестирования runtime — подавать готовую schema, а не начинать с free-form user task и надеяться, что Planner одновременно правильно классифицировал, спланировал и исполнил её.

Уровни проверяются отдельно:

```text
schema -> Runtime -> STEP 1 -> assert output/context -> STEP 2 -> ...
```

Отдельно тестируется Planner schema:

```text
root task
-> QUALIFY
-> SIMPLE: WORKER
или
-> MULTI/PROCESS: PLAN -> nested SEQUENCE
```

Абстрактный benchmark для MULTI:

```text
Исследовать JSON, YAML и JavaScript как форматы конфигурации,
сравнить их и выбрать один вариант.
```

Ожидаемая semantic sequence после PLAN:

```text
STEP 1 — исследовать JSON
STEP 2 — исследовать YAML
STEP 3 — исследовать JavaScript
STEP 4 — сравнить и выбрать
         context.steps = [1, 2, 3]
```

Такой кейс не зависит от Todo test project и непосредственно проверяет local context/numbering.

## Реализовано в prototype

- enum `STEP`, `ACTION`, `TASK_TYPE` в Core contract;
- schema без обязательных model-facing `id`;
- `input.context.parent/previous/steps`;
- строгая локальная нумерация и runtime validation ссылок;
- nested parent isolation;
- output рядом со step без отдельного lifecycle state;
- `transition(plan, step)` с local sequence;
- tail rewrite после completed step;
- `QUALIFY`, `PLAN`, `REPLAN` как отдельные runtime steps;
- Planner как automation schema;
- запрет `ACTION` внутри model-generated PLAN;
- отдельные qualifier/plan prompts и response contracts;
- abstract automation prototype для SIMPLE/MULTI/PROCESS.

## TODO / следующие проверки

- Подключить реальные model-backed реализации `QUALIFY` и `PLAN` вместо prototype planner.
- Проверить устойчивость qualifier на реальных задачах и подобрать критерии `SIMPLE/MULTI/PROCESS`.
- Реализовать `ACTION.ASK_USER` через существующую Human interaction boundary.
- Добавить **допланирование**: успешная sequence может осознанно остановиться, посмотреть результаты и вызвать PLAN для продолжения.
- Определить configurable output presentation: text, structured data, usage/resources, request metadata.
- Определить storage/versioning revisions и цепочки неудачных попыток.
- Добавить resume с отдельной текущей точкой выполнения и позже auto-detection шага при загрузке process document.
- Решить, какие orchestration Actions (если вообще какие-то) Planner сможет генерировать в будущем; operational Actions Worker по-прежнему не должны утекать в semantic plan.

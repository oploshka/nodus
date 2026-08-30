# Automation runtime

Статус: эксперимент.

Цель — проверить Nodus как ограничивающий Core runtime, который опрашивает подключаемые модули и исполняет возвращаемые ими process schemas.

Актуальный рабочий process contract описан в `doc/research/process-schema-v2.md`.

## Engine boundary

Исполняющая механика больше не принадлежит `Automation`:

```text
src/engine/
  Process/
    ProcessRuntime.ts
    ProcessSchema.ts
    ProcessTsType.ts
    StepRef.ts

    Action/
      Action.ts
      ...

    Worker/
      WorkerSchema.ts
      WorkerRunner.ts
      WorkerTsType.ts

    Planner/
      PlannerResolver.ts
      PlannerModule.ts
      PlannerTsType.ts

  Automation/
    AutomationLoader.ts
```

`Process` задаёт язык и правила исполнения. `Automation` только загружает versioned behavior из `automation/`.

## Automation data

`automation/` группируется по механизмам, а не по типам файлов:

```text
automation/
  Planner/
    PlannerTask/
      PlannerTask.js
      PlannerTaskPrompt.md
      PlannerTaskResponse.js

  Qualifier/
    QualifierTask/
      QualifierTask.js
      QualifierTaskPrompt.md
      QualifierTaskResponse.js

  Worker/
    WorkerCode/
      WorkerCode.js
      WorkerCodePrompt.md
      WorkerCodeResponse.js
```

Prompt и response contract colocated с механизмом, которому они принадлежат. Внутри automation package используется native Node alias `#automation/*`.

Служебные cache/log/state/session/index данные остаются в `.nodus/`.

## Core contract

Core фиксирует язык исполнения: `STEP.SEQUENCE`, `QUALIFY`, `PLAN`, `WORKER`, `ACTION`, `VALIDATE`, `REPLAN`.

Конкретные classifier options и Action ids не являются Core enum. Например `SIMPLE/MULTI/PROCESS` принадлежат `QualifierTask`, а Worker объявляет нужный ему набор Actions.

Модуль на опрос Core возвращает ровно один из двух результатов:

```text
OUTPUT
SCHEMA
```

`OUTPUT` завершает текущую работу модуля. `SCHEMA` передаёт Core локальную schema; Core сохраняет её рядом с вызвавшим step и исполняет сам.

Planner обычно возвращает `SCHEMA`. Worker может вернуть `OUTPUT` или `SCHEMA`. Action ожидается terminal executor и обычно возвращает `OUTPUT`.

## Worker boundary

Core-side Worker состоит из двух простых частей:

```text
WorkerSchema = конфигурация Worker
WorkerRunner = abstract execution boundary
```

`WorkerSchema` получает prompt, response, Actions и limits. Кастомное поведение наследуется от `WorkerRunner` и реализует `run(request) -> OUTPUT | SCHEMA`.

Конкретная реализация Worker может находиться в `automation/`; Core не должен знать детали её поведения.

## PlannerResolver

Planner выбирается Core boundary через `PlannerResolver`.

Текущая версия намеренно простая: один Planner — вернуть его; ни одного — configuration error; несколько — error, пока selection policy не реализована.

## Локальная sequence и StepRef

Persisted/model-facing schema по-прежнему использует простые локальные номера:

```js
steps: [1, 2, 3]
```

При исполнении Core проверяет номер и превращает его в runtime-only `StepRef`, который держит ссылку на реальный объект уже выполненного step. Модель `StepRef` не видит.

Это сохраняет простой schema format и одновременно не заставляет внутреннее выполнение повторно адресовать dependency по изменяемой позиции массива.

`transition(plan, step)` получает только текущую локальную sequence и может переписать только невыполненный хвост.

`SEQUENCE.output` не синтезируется Core семантически: успешная sequence отдаёт наружу output своего последнего локального step.

## Текущий PlannerTask prototype

```text
QUALIFY
  ├─ SIMPLE  -> WORKER
  ├─ MULTI   -> PLAN
  └─ PROCESS -> PLAN
```

`PLAN` возвращает `SCHEMA`, и Core исполняет её как вложенную локальную schema самого PLAN step.

Planner планирует semantic tasks и не имеет права генерировать `STEP.ACTION`.

## Запуск prototype

```bash
npm run prototype:automation -- "Сформулировать один итоговый ответ"
```

```bash
npm run prototype:automation -- --multi "Сравнить JSON, YAML и JavaScript как форматы конфигурации"
```

```bash
npm run prototype:automation -- --process "Исследовать варианты, сравнить их, затем выбрать итог"
```

Prototype использует fake Planner и custom `WorkerRunner`. Он проверяет PlannerResolver, routing, `OUTPUT | SCHEMA`, local numbering, `StepRef` и context wiring без зависимости от реальной модели.

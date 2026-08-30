# Automation runtime

Статус: эксперимент.

Цель — проверить Nodus как ограничивающий Core runtime, который опрашивает подключаемые модули и исполняет возвращаемые ими process schemas.

Актуальный рабочий process contract описан в `doc/research/process-schema-v2.md`.

## Разделение данных

`automation/` хранит версионируемое поведение Nodus и группируется по механизмам, а не по типам файлов:

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

Prompt и response contract colocated с механизмом, которому они принадлежат. Глобальных `prompts/`, `responses/` и `schemas/` registries больше нет.

Внутри automation package используется native Node alias `#automation/*`.

Служебные cache/log/state/session/index данные остаются в `.nodus/`.

## Core contract

Core фиксирует язык исполнения: `STEP.SEQUENCE`, `QUALIFY`, `PLAN`, `WORKER`, `ACTION`, `VALIDATE`, `REPLAN`.

Конкретные classifier options и Action ids не являются Core enum. Например `SIMPLE/MULTI/PROCESS` принадлежат `QualifierTask`, а Worker сам объявляет набор нужных ему Actions.

Модуль на опрос Core возвращает ровно один из двух результатов:

```text
OUTPUT
SCHEMA
```

`OUTPUT` завершает текущую работу модуля. `SCHEMA` передаёт Core локальную schema; Core сохраняет её рядом с вызвавшим step и исполняет сам.

Planner обычно возвращает `SCHEMA`. Worker может вернуть `OUTPUT` или `SCHEMA`. Action ожидается terminal executor и обычно возвращает `OUTPUT`.

## PlannerResolver

Planner выбирается Core boundary через `PlannerResolver`.

Текущая версия намеренно простая: один Planner — вернуть его; ни одного — configuration error; несколько — error, пока selection policy не реализована.

## Локальная sequence

Каждая `SEQUENCE` имеет локальную one-based нумерацию. Шаг получает только явно выбранный context: `parent`, `previous`, `steps`.

`transition(plan, step)` получает только текущую локальную sequence и может переписать только невыполненный хвост.

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

Prototype использует fake Planner/Worker modules. Он проверяет PlannerResolver, routing, `OUTPUT | SCHEMA`, local numbering и context wiring без зависимости от реальной модели.

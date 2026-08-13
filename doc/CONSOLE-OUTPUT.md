# Console output contract

Этот документ фиксирует человекочитаемый контракт консоли Nodus. Консоль — дерево выполнения для пользователя, а не диагностический лог. Полные model request/response, machine IDs и event payload остаются в `.nodus/logs/*-nodus.log`.

## Иерархия

```text
[Engine]
  [Planner]
    [Model]

  [Determine]
    [Model]

  [Worker]
    [Action]
      [Model]
      [Research]
        [Model]
      [Edit]
        [Model]
```

Корневыми остаются lifecycle-события Engine. Всё, что выполняется внутри задачи или шага, имеет отступ. Владелец операции сообщает её смысл; `[Model]` сообщает только факт обработки и стоимость model call.

## Model

Нормальный model-call выглядит так:

```text
    [Model] Обрабатываю...
    [Model] Ответ получен · 22.3s · 3000 → 573 = 3573 tok
```

Порядок токенов всегда `input → output = total`. `finishReason` показывается только если отличается от нормального `stop`. Скорость генерации можно показывать только если adapter/provider возвращает отдельную достоверную timing-метрику; вычислять её как `completionTokens / totalDuration` нельзя.

Точный prompt (`Split...`, `Determine...`) в консоль не выводится.

## Planner и Engine step

```text
[Engine] Задача получена
  [Planner] Строю план
    [Model] Обрабатываю...
    [Model] Ответ получен · 57.6s · 719 → 266 = 985 tok
  [Planner] План получен · 2 шаг(а)
    1. First semantic goal...
    2. Second semantic goal...

[Engine] Шаг 1/2
  First semantic goal...
```

Пользовательский task text после `[Engine] Задача получена` не повторяется. Goal текущего шага повторяется отдельной приглушённой строкой.

## Worker и Action

Worker имеет стабильный machine `id` и отдельный Presentation с человекочитаемым именем:

```text
  [Worker] Code
    [Action] Изменение кода · попытка 1 · метод: range-replace
```

Machine IDs (`code`, `change-code-range-replace`) остаются в file log. Для Action `detail` является UI-характеристикой конкретной реализации; Presentation решает, показывать ли её как `метод`.

`ResearchAction` не выводится как `[Action] research`: Research является отдельным доменным блоком.

## Research

Research request разделяет **где смотреть** и **что узнать**. Если Worker знает файлы, они передаются структурированно в `targets`, а не вписываются внутрь вопроса:

```text
    [Research] Вопрос 3/4
      src/app/Config/Configuration.ts, src/app/Config/ConfigurationLoader.ts
      → Как выглядит текущая структура runtime: есть ли runtime-объект и какие поля в нём?
      [Model] Обрабатываю...
      [Model] Ответ получен · 13.7s · 1068 → 62 = 1130 tok
    [Research] Ответ найден · источников: 5
```

Если Worker не знает target, Research request содержит только question и Research сам выбирает candidate files из project index. Target-файлы являются project-root-relative путями и проходят обычный Project path resolution.

## Edit

Edit показывает change-set как компактный вложенный блок. Повторять `[Edit]` на каждой строке файла не нужно:

```text
      [Edit] Подготавливаю change-set · изменений: 4
        src/engine/Planner/ModelPlanner.ts
          [Model] Обрабатываю...
          [Model] Ответ получен · 58.6s · 2599 → 265 = 2864 tok
        ✓ Подготовлено · операций: 2

        src/app/Bootstrap.ts
          [Model] Обрабатываю...
          [Model] Ответ получен · 8.0s · 2550 → 22 = 2572 tok
        ✗ Не удалось подготовить · range-replace не вернул операций
```

Preparation/commit остаются атомарной механикой change-set; консоль только отображает её состояние.

## Финал Engine

Не нужно повторять один и тот же status через Engine logger и отдельный CLI summary. Финальный task status принадлежит Engine Presentation:

```text
[Engine] Задача не завершена
  Причина: ...
  Выполнение можно продолжить.
```

Для completed достаточно `[Engine] Задача завершена`. Расширенная агрегированная статистика задачи добавляется отдельно и не требует дополнительного model-call.

## Presentation

Общий контракт `Presentation<TEvent>` — только технический контракт renderer-а. `EnginePresentation`, `PlannerPresentation`, `DeterminePresentation`, `WorkerPresentation`, `ActionPresentation`, `ResearchPresentation`, `EditPresentation` и `ModelPresentation` — независимые полноценные классы и не обязаны сходиться в общую семантическую иерархию.

Runtime-сущность хранит готовый Presentation рядом с machine id. Presentation владеет role/color/format для своей сущности; `ConsoleLogger` применяет ANSI, отступы и выводит `PresentedMessage`.

Цветовая иерархия при ANSI: `[Engine]` — bright white/bold, `[Planner]` — magenta, `[Determine]` — cyan, `[Worker]` — yellow, `[Action]` — green, `[Research]` — bright magenta, `[Edit]` — bright cyan, `[Model]` — blue, `[App]` — gray. Цвет не является semantic contract: без ANSI дерево должно полностью читаться по labels и отступам.

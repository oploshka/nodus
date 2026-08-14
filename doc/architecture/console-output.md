# Console output contract

Консоль Nodus — это человекочитаемое дерево выполнения, а не диагностический лог. Полные model request/response, payload событий, stable IDs (`code`, `change-code-range-replace` и т. п.) и технические причины остаются в `.nodus/logs/*-nodus.log`.

Главное правило: **владелец операции сообщает её смысл, `[Model]` сообщает только факт обработки и стоимость model call**.

## Иерархия

```text
[Engine] Задача получена
  [Planner] Строю план
    [Model] Обрабатываю...
    [Model] Ответ получен · 719 → 277 = 996 tok · 56.9s
  [Planner] План получен · 2 шага
    1. First semantic goal...
    2. Second semantic goal...

[Engine] Приступаю к выполнению плана

[Engine] Шаг 1
  First semantic goal...
  [Determine] Выбираю исполнителя
    [Model] Обрабатываю...
    [Model] Ответ получен · 326 → 13 = 339 tok · 3.1s
  [Determine] Исполнитель выбран: Разработка

  [Worker] Разработка
    [Action] Изменение кода · попытка 1 · точечная замена
      [Model] Обрабатываю...
      [Model] Ответ получен · 1058 → 349 = 1407 tok · 69.6s
    [Action] Изменение кода · не завершено · попытка 1 · требуется данных: 1

    [Research] Вопрос 1/4
      Where is the current limit defined?
      [Model] Обрабатываю...
      [Model] Ответ получен · 2602 → 45 = 2647 tok · 12.8s
    [Research] Ответ найден · источников: 5

    [Action] Изменение кода · попытка 2 · точечная замена
      [Edit] Подготавливаю набор изменений · файлов: 2
        src/engine/Planner/ModelPlanner.ts
          [Model] Обрабатываю...
          [Model] Ответ получен · 2599 → 265 = 2864 tok · 58.6s
        ✓ Подготовлено · 2 операции

        src/app/Bootstrap.ts
          [Model] Обрабатываю...
          [Model] Ответ получен · 2550 → 22 = 2572 tok · 8.0s
        ✗ Не удалось подготовить · точечная замена не предложила операций
```

Корневыми остаются только значимые lifecycle-события Engine. Planner, Determine, Worker, Action, Research, Edit и Model визуально вложены в владельца текущей операции. `Шаг 1`, а не `Шаг 1/2`, намеренно не кодирует общее количество шагов в идентификатор шага: это оставляет место для будущих `1.1`, replanning и других структур исполнения.

## Presentation

Все пользовательские имена и форматирование принадлежат объектам `Presentation`, а machine IDs остаются стабильными отдельно. `ConsoleLogger` отвечает за ANSI, отступы и вывод готового `PresentedMessage`.

```ts
interface Presentation<TEvent> {
  readonly role: string;
  readonly color: PresentationColor;
  format(event: TEvent, responseLanguage?: string): PresentedMessage | undefined;
}
```

Роли независимы: `EnginePresentation`, `PlannerPresentation`, `DeterminePresentation`, `WorkerPresentation`, `ActionPresentation`, `ResearchPresentation`, `EditPresentation`, `ModelPresentation`. Общий интерфейс — renderer contract, а не общая семантическая база.

Machine ID не является пользовательским именем. Например:

- `code` → `Разработка` / `Development`;
- `documentation` → `Документация` / `Documentation`;
- `range-replace` → `точечная замена` / `precise replacement`;
- `replace` → `точная замена` / `exact replacement`;
- `diff` → `патч` / `patch`;
- `edit` → `полная правка файла` / `full-file edit`.

## Model metrics

Обычный успешный model call показывается как:

```text
[Model] Ответ получен · 1597 → 717 = 2314 tok · 144.9s
```

Порядок: `prompt → completion = total`, затем wall-clock duration. `finishReason` выводится только если отличается от нормального `stop`. Скорость generation (`tok/s`) выводится только если adapter/provider предоставляет отдельную достоверную метрику; она не вычисляется как `completionTokens / wall time`.

Точный prompt и полный exchange в console не выводятся.

## Edit

Термин `change-set` относится к внутренней реализации и не используется в пользовательском тексте. Консоль говорит `набор изменений`. Внутри блока файл выводится один раз, затем model call и результат подготовки. Это уменьшает повторение `[Edit]` и делает область конкретного файла визуально явной.

## Финал задачи и статистика

CLI не печатает второй summary после `Engine.run()`: terminal lifecycle принадлежит `EnginePresentation`.

Итог строится детерминированно из runtime events, без дополнительного model call:

```text
[Engine] Задача завершена · 6m 42s
  План: 2/2 шагов завершено
  Model: 11 вызовов · 15000 → 3420 = 18420 tok
  Research: 4 запросов · кеш: 1
  Worker: 3 попыток
  Edit: 5 файлов · 7 операций
  Методы: точечная замена 4 · патч 1
```

Для `not-completed` / `failed` Engine выводит одну финальную причину и признак возможности продолжения, после чего ту же task-level статистику. Промежуточный `engine.step.finish` не дублирует отрицательный terminal status.

## Цвета

При ANSI цвет отражает визуальную значимость роли, но не является semantic contract:

- Engine — bright white / bold;
- Planner — magenta;
- Determine — cyan;
- Worker — yellow;
- Action — green;
- Research — bright magenta;
- Edit — bright cyan;
- Validation — bright green;
- Model — blue;
- App — gray.

Без цвета структура должна полностью читаться по labels и отступам.


## Validation

Validation — отдельный Engine-level блок после успешного Worker/Edit результата. Сейчас он минимален:

```text
  [Validation] Проверяю результат
  [Validation] Проверка пройдена
```

`Validation` имеет собственный `ValidationPresentation`; diagnostic details будущих validators не должны превращаться в ad-hoc форматирование внутри `ConsoleLogger`.

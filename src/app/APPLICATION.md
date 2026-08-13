# Application layer

`app` is the process/composition layer. It reads external startup input, creates concrete services and starts Engine. It does not own task reasoning.

## Startup

`Main.ts` owns process-level input. The current CLI startup path is:

1. parse command-line arguments;
2. load external configuration;
3. create app-level implementations such as the logger;
4. create/open the shared Project instance needed by the CLI administrative `/scan` command;
5. ask `Bootstrap.createEngine(...)` to compose and return Engine;
6. start CLI with the ready Engine.

`ConfigurationLoader` only reads/minimally validates external configuration and resolves the project root relative to the config file. Runtime defaults are intentionally not injected by the loader.

`Bootstrap` is the Engine composition root. It creates/wires model, Research, Planner and Worker dependencies and returns only `Engine`. Optional overrides exist for alternative startup configurations and tests.

The temporary `/scan` command remains app-level administration and is not part of `Engine.run()` orchestration.


## Language configuration

The application accepts three independent language hints:

- `language.project` — preferred language for human-authored project text such as documentation and comments;
- `language.nodus` — machine-facing language for Planner goals, Worker questions, Research answers and other internal orchestration data;
- `language.response` — language for user-facing summaries, errors, interactions and console labels.

The current recommended/default internal Nodus language is English because project identifiers and source-code search terms are usually English. The user task itself may be written in any language. Central enforcement of this default is planned for the model layer; some callers still add the language guidance themselves.

## Logging

Concrete logger implementations live in `app/Logging`. Engine owns only the shared logging contract in `engine/Type`. `ConsoleLogger` renders compact human progress (`Engine / Planner / Worker / Research / Model`), while `FileLogger` keeps the full diagnostic event payload including model exchange data.
## CLI input

Interactive CLI input is multiline: `Enter` inserts a new line, while `Ctrl+Enter` or `Ctrl+D` submits the buffered task. `Ctrl+C` cancels the current input. After `Engine.run()` returns, CLI always prints an explicit terminal task status (`completed`, `not-completed`, or `failed`) so a blinking prompt is not confused with active execution.


## CLI diagnostics and startup flags

The interactive CLI keeps console output intentionally compact, while a `FileLogger`
records the complete nested event payload (including model request/response exchange)
into one timestamped `.nodus/logs/*-nodus.log` file for the process run. The file path
is printed at startup so the log can be attached directly when debugging.

Supported startup flags:

- `--clear-cache` removes the persisted project index and Research cache before opening the project;
- `--clear-logs` removes previous `.nodus/logs` before creating the current run log;
- `--scan` forces a scan when the project is configured with manual scanning. With `scanMode: on-open`, opening the project already performs a fresh scan.

The project index is not only diagnostic state: Research candidate-file selection uses
it directly, so an available/current scan affects runtime Research behavior.

In raw multiline mode, `Ctrl+C` cancels a non-empty input. Pressing `Ctrl+C` at an
empty prompt exits the CLI. `/exit` remains available as an explicit command.


## Console output

Консоль — это человекочитаемое дерево выполнения, а не диагностический лог. Полные model request/response, payload событий, stable IDs (`code`, `change-code-range-replace` и т. п.) и прочие технические детали остаются в `.nodus/logs/*-nodus.log`.

Главное правило: **владелец операции сообщает её смысл, `[Model]` сообщает только факт обработки и стоимость model call**. Пользователь должен по отступам видеть происхождение каждого действия:

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

Пример целевого вывода:

```text
[Engine] Задача получена
  [Planner] Строю план
    [Model] Обрабатываю...
    [Model] Ответ получен · 22.3s · 3573 tok · 3000→573
  [Planner] План получен · 2 шага
    1. First semantic goal...
    2. Second semantic goal...

[Engine] Шаг 1/2
  First semantic goal...
  [Determine] Выбираю исполнителя
    [Model] Обрабатываю...
    [Model] Ответ получен · 3.2s · 343 tok · 280→63
  [Determine] Исполнитель выбран: Code

  [Worker] Code
    [Action] Изменение кода · попытка 1 · метод: range-replace
      [Model] Обрабатываю...
      [Model] Ответ получен · 39.5s · 1115 tok · 925→190
    [Action] Изменение кода · не завершено · попытка 1 · требуется данных: 1

    [Research] Вопрос 1/4
      Where is the current limit defined?
      [Model] Обрабатываю...
      [Model] Ответ получен · 16.6s · 3530 tok · 3100→430
    [Research] Ответ найден · источников: 5

    [Action] Изменение кода · попытка 2 · метод: range-replace
      [Edit] Подготавливаю change-set · изменений: 1
      [Edit] Подготавливаю изменения: src/example.ts
        [Model] Обрабатываю...
        [Model] Ответ получен · 7.5s · 2649 tok · 2498→151
      [Edit] Изменения подготовлены: src/example.ts · операций: 2
      [Edit] Применяю change-set · файлов: 1
      [Edit] Change-set применён · файлов: 1
    [Action] Изменение кода · завершено · попытка 2

[Engine] Шаг 1/2: завершено
```

Правила представления:

- `engine.task.start` не повторяет пользовательский текст задачи: он уже виден в CLI input;
- всё, что выполняется внутри Engine task/step, имеет отступ; корневыми остаются только значимые `[Engine]` lifecycle-события;
- Plan goal повторяется при старте текущего Engine step, но выводится отдельной приглушённой строкой, а не смешивается с заголовком шага;
- generic model prompt (`request: Split...`, `Determine...`) не выводится в консоль; точный prompt доступен в file log;
- `[Model]` показывает `duration`, `totalTokens`, а при наличии meta — `promptTokens→completionTokens`; `finishReason` показывается только если он отличается от нормального `stop`;
- модель не интерпретирует свой payload как `план`, `выбор`, `изменения готовы`: это сообщает вызывающий Planner/Determine/Action;
- Worker имеет стабильный machine `id` и отдельное человекочитаемое имя (`Code`, `Documentation`, `Agent`); консоль использует имя, file log сохраняет id;
- Action аналогично имеет semantic name и при необходимости отдельный `method`; например machine id `change-code-range-replace` показывается как `Изменение кода · метод: range-replace`;
- `ResearchAction` не печатается как `[Action] research`: в консоли это один доменный блок `[Research]`, чтобы не дублировать одну операцию двумя labels;
- `[Edit]` отображает подготовку/commit change-set и показывает вложенный model call, если edit strategy обращается к модели;
- пункты Plan, step goal и Research question относятся к вторичному тексту и при ANSI выводятся приглушённым серым;
- финальный task summary строится из накопленных runtime events/results без дополнительного model call; расширенная metrics aggregation остаётся отдельной доработкой.

Цветовая иерархия при ANSI intentionally отражает значимость и помогает различать соседние уровни: `[Engine]` — яркий белый/bold, `[Planner]` — magenta, `[Determine]` — cyan, `[Worker]` — yellow, `[Action]` — green, `[Research]` — bright magenta, `[Edit]` — bright cyan, `[Model]` — blue, `[App]` — gray. Цвет не несёт semantic contract: без ANSI структура должна полностью читаться по labels и отступам.

### Presentation objects

Человекочитаемое представление больше не должно постепенно разрастаться внутри `ConsoleLogger` в таблицу `id -> name/color/format`. Runtime-сущность может объявить полноценный `presentation`-объект, а logger/renderer только применяет его к событию.

Базовый контракт находится в `engine/Presentation`:

```ts
interface Presentation<TEvent> {
  readonly role: string;
  readonly color: PresentationColor;
  format(event: TEvent, responseLanguage?: string): PresentedMessage | undefined;
}
```

Presentation является именно объектом поведения, а не набором декоративных полей. Он владеет:

- label роли (`Worker`, `Action`, `Engine`);
- рекомендуемым цветом роли;
- человекочитаемым именем конкретной реализации;
- преобразованием runtime event data в текст/details для пользователя.

Конкретная runtime-реализация хранит готовый presentation рядом с machine id:

```ts
class CodeWorker {
  readonly id = 'code';
  readonly presentation = new WorkerPresentation({ name: { en: 'Code' } });
}

class ChangeCodeRangeReplaceAction {
  readonly id = 'change-code-range-replace';
  readonly presentation = new ActionPresentation({
    name: { en: 'Code change', ru: 'Изменение кода' },
    detail: 'range-replace',
  });
}
```

`detail` — UI-характеристика реализации, а не отдельная обязательная domain-концепция `method`. Старые `name/method` пока сохранены как compatibility aliases и выводятся из presentation; источником истины должен быть presentation.

Presentation теперь используется всеми runtime-ролями консольной оркестрации: `Engine`, `Planner`, `Determine`, `Worker`, `Action`, `Research`, `Edit`, `Model`. Каждая роль имеет собственный полноценный Presentation-класс и развивается независимо. Общий `Presentation<TEvent>` — только технический контракт renderer-а; сходство текущих сообщений не является основанием для общего базового класса, наследования или formatter DSL.

Emitters передают presentation вместе с runtime event. `ConsoleLogger` отвечает за ANSI, отступ и вывод уже сформированного `PresentedMessage`; он не должен знать semantic formatting конкретных Planner/Determine/Research/Edit/Model событий. Machine ids, точные prompts и диагностические payload остаются в file log.

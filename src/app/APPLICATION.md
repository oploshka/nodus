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

Консоль — это человекочитаемое представление хода выполнения, а не диагностический лог. Полные model request/response, payload событий и технические детали остаются в `.nodus/logs/*-nodus.log`.

Основной принцип вывода: **владелец операции сообщает её смысл, `[Model]` сообщает только факт обработки и стоимость вызова**. Модель не должна выглядеть владельцем Plan, выбора Worker или результата Action только потому, что соответствующий компонент использовал model call.

Компонентные labels остаются на английском (`[Engine]`, `[Planner]`, `[Determine]`, `[Worker]`, `[Action]`, `[Research]`, `[Edit]`, `[Model]`). Поясняющий текст следует `language.response`. При поддержке ANSI labels окрашиваются, а вторичный текст (например пункты плана) выводится приглушённым серым.

Ожидаемая причинная структура:

```text
[Engine] Задача получена
[Planner] Строю план
  [Model] Обрабатываю...
  [Model] Ответ получен · 57.6s · 996 tok
[Planner] План получен · 2 шага
  1. First semantic goal...
  2. Second semantic goal...

[Engine] Шаг 1/2: First semantic goal...
[Determine] Выбираю исполнителя
  [Model] Обрабатываю...
  [Model] Ответ получен · 3.2s · 343 tok
[Determine] Исполнитель выбран: code
[Worker] code: начало
[Action] change-code-range-replace · попытка 1
  [Model] Обрабатываю...
  [Model] Ответ получен · 44.5s · 1144 tok
```

Правила:

- `engine.task.start` не повторяет пользовательский текст задачи: он уже виден в CLI input;
- Planner явно сообщает начало планирования до долгого model call;
- generic `[Model] request: <prompt>` не выводится в консоль; точный prompt доступен в file log;
- `[Model]` не интерпретирует payload как `план`, `выбор`, `изменения готовы` и т. п.; это ответственность вызывающего компонента;
- `[Determine]` отвечает за выбор Worker и сообщает выбранный `workerId`; `[Engine]` не дублирует эту строку;
- `[Action]` показывает выбранную Action и номер попытки; `[Worker]` показывает lifecycle Worker;
- `[Research]` и `[Edit]` остаются отдельными bounded operations и показывают полезный progress без model transport payload;
- пункты Plan печатаются один раз после получения Plan; повтор goal при `Engine` step start допустим, потому что обозначает текущий исполняемый шаг;
- долгий model call должен быть виден сразу через `[Model] Обрабатываю...`; переписывание этой строки in-place не требуется;
- финальный task summary должен строиться из уже накопленных runtime events/results без дополнительного model call. Детальная task metrics aggregation — отдельная доработка.

Эта схема намеренно показывает происхождение решений: `Engine -> Planner -> Model`, `Engine -> Determine -> Model`, `Worker -> Action -> Model/Research/Edit`, не смешивая semantic ownership с model transport.

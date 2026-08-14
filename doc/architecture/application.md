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
- `language.nodus` — machine-facing language for Planner goals, constraints, Worker/Action contracts, Research questions/answers, edit instructions, summaries/reasons consumed by Nodus and other internal orchestration data;
- `language.response` — language only for text whose direct consumer is the user, plus deterministic user-facing errors, interactions and console labels.

Language is selected by the consumer of generated data, not by a field name. In particular, a `summary` or `reason` passed from a Worker back to Engine is `language.nodus`, while human-authored documentation/comments written into the project use `language.project`.

The current recommended/default internal Nodus language is English because project identifiers and source-code search terms are usually English. The user task itself may be written in any language. Central enforcement of this default is planned for the model layer; some callers still add the language guidance themselves.

## Logging

Concrete logger implementations live in `app/Logging`. Engine owns only the shared logging contract in `engine/Type`. `ConsoleLogger` renders compact human progress (`Engine / Planner / Worker / Research / Model`), while `FileLogger` keeps the full diagnostic event payload including model exchange data.
## CLI input

Interactive CLI input is multiline: `Enter` inserts a new line, while `Ctrl+Enter` or `Ctrl+D` submits the buffered task. `Ctrl+C` cancels the current input. Terminal task status and deterministic execution metrics are emitted by Engine/Console presentation rather than duplicated by the CLI after `Engine.run()`.


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

Полный контракт человекочитаемого вывода, иерархии, Presentation, Model metrics, Edit-блоков и task-level summary зафиксирован отдельно в [`doc/CONSOLE-OUTPUT.md`](../../doc/CONSOLE-OUTPUT.md). `ConsoleLogger` остаётся renderer-ом; диагностические payload и model exchange принадлежат `FileLogger`.

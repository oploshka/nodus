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

The temporary `/scan` command remains app-level administration and is not part of `Engine.runTask()` orchestration.

## Logging

Concrete logger implementations live in `app/Logging`. Engine owns only the shared logging contract in `engine/Type`.

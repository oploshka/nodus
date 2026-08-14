# Application layer

`app` — process/composition layer. Он читает внешний startup input, создаёт concrete services и запускает Engine. Task reasoning этому слою не принадлежит.

## Startup

`Main.ts` владеет process-level input. Текущий CLI startup path:

1. разобрать command-line arguments;
2. загрузить внешнюю configuration;
3. создать app-level implementations, например logger;
4. создать/открыть общий Project, необходимый административной CLI-команде `/scan`;
5. вызвать `Bootstrap.createEngine(...)`, который собирает и возвращает Engine;
6. запустить CLI с готовым Engine.

`ConfigurationLoader` только читает и минимально валидирует внешний config и разрешает project root относительно config-файла. Runtime defaults намеренно не подмешиваются loader'ом.

`Bootstrap` — composition root Engine. Он создаёт и связывает model, Research, Planner, Worker, Edit и Validation dependencies и наружу возвращает Engine. Overrides используются для альтернативной startup configuration и тестов.

Временная команда `/scan` остаётся app-level administration и не является частью `Engine.run()` orchestration.

## Language configuration

Application принимает три независимых language hints:

- `language.project` — предпочтительный язык human-authored текста проекта: документации, комментариев и похожего содержимого;
- `language.nodus` — machine-facing язык Planner goals/constraints, Worker/Action contracts, Research questions/answers, edit instructions и других внутренних orchestration данных;
- `language.response` — язык текста, непосредственным потребителем которого является пользователь, включая deterministic user-facing errors и console labels.

Язык определяется потребителем данных, а не названием поля. Например, `summary`, который Worker возвращает Engine, относится к `language.nodus`, а комментарий, записываемый в пользовательский проект, — к `language.project`.

Рекомендуемый/default internal language Nodus — English, поскольку identifiers и source-code search terms обычно английские. Пользовательская task может быть написана на любом языке. Общая machine-facing policy централизована в model layer; component-specific prompts отвечают только за собственную semantic guidance.

## Logging

Concrete logger implementations находятся в `app/Logging`. Engine владеет только общим logging contract в `engine/Type`.

`ConsoleLogger` показывает компактный human-readable progress, а `FileLogger` сохраняет полный diagnostic event payload, включая model exchange.

## CLI input

Interactive CLI input поддерживает multiline режим:

- `Enter` добавляет новую строку;
- `Ctrl+Enter` или `Ctrl+D` отправляет task;
- `Ctrl+C` отменяет непустой input;
- `Ctrl+C` на пустом prompt завершает CLI;
- `/exit` остаётся явной командой выхода.

Terminal task status и deterministic execution metrics формируются Engine/Presentation и не дублируются CLI после `Engine.run()`.

## CLI diagnostics и startup flags

`FileLogger` пишет один timestamped `.nodus/logs/*-nodus.log` для process run. Путь к нему показывается при startup.

Поддерживаемые flags:

- `--clear-cache` удаляет persisted project index и Research cache перед открытием Project;
- `--clear-logs` удаляет предыдущие `.nodus/logs` перед созданием текущего run log;
- `--scan` принудительно запускает scan при manual scan mode. При `scanMode: on-open` Project и так сканируется при открытии.

Project index является runtime dependency Research candidate selection, а не только диагностическим состоянием.

## Console output

Контракт human-readable вывода, Presentation hierarchy, Model metrics, Edit blocks и task-level summary описан в [`console-output.md`](console-output.md). `ConsoleLogger` остаётся renderer'ом, а полный diagnostic payload и model exchange принадлежат `FileLogger`.

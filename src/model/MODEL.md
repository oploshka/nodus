# Model layer

`model` — единая граница между Nodus и LLM/capabilities, связанных с моделью.

## ModelRunner

`ModelRunner` — единственная runtime-точка, через которую engine должен вызывать модель.

Его контракт:

1. получить логические messages + выбранный `ModelResponseFormatter`;
2. применить model defaults и message transport layout;
3. вызвать `ModelAdapter`;
4. получить raw text от provider;
5. распарсить raw text выбранным formatter;
6. вернуть вызывающему коду JavaScript object + usage metadata.

Engine не должен разбирать `response.content` самостоятельно.

## Adapter

`ModelAdapter` отвечает только за provider transport. `OpenAICompatibleModelAdapter` работает с `/chat/completions` и ничего не знает про Planner, Worker или response protocols.

Такое разделение позволяет тестам подменять adapter queue/fake реализацией, сохраняя настоящий `ModelRunner` и formatters.

## Response formatters

`model/Response` содержит форматирование/парсинг wire response.

Сейчас:

- `PlannerResponseFormatter` -> `{ steps: [...] }`;
- `ExecutionPlannerResponseFormatter` -> `{ type: 'action' | 'completed' | 'failed', ... }`;
- `EditFileResponseFormatter` -> typed patch/write/delete object;
- `TextResponseFormatter` -> `{ text }`.

Модель по-прежнему может возвращать простой RAW protocol, если он надёжнее для локальной модели. Требование — не заставить LLM генерировать JSON, а не выпускать raw text за пределы model layer.

## Prompt / Profile / Request

В model возвращены независимые части старого слоя:

- logical request types;
- message transport (`collapsed-user | layered`);
- common prompt composer;
- model call/profile types.

Старый `ModelController` намеренно не переносится целиком: он смешивал transport, context, operation orchestration и parsing. Эти обязанности теперь разделены.

## Tools

`model/Tool` содержит model capabilities:

- `FileSystemTool`;
- `SearchTool`;
- `GitTool`;
- `TerminalTool`;
- `ToolRegistry`.

Они возвращены как независимые низкоуровневые возможности, но текущий DefaultWorker не выдаёт их модели автоматически. Доступ к tools должен быть явной capability/policy конкретного execution flow.

Старый `ToolExecutor`, привязанный к v0.2 Execution context, не переносится автоматически.

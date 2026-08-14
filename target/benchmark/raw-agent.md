# Raw agent benchmark

Этот benchmark намеренно обходит Nodus planning, Research, Worker и execution orchestration. Он использует ту же model/project configuration и низкоуровневые project tools, чтобы дать контрольную группу для сравнения.

Запуск фиксированной `/status` задачи:

```bash
npm run benchmark:raw-agent -- nodus.config.json
```

Или произвольной задачи:

```bash
npm run benchmark:raw-agent -- nodus.config.json "Your task here"
```

Runner предоставляет только `file-system`, `search` и `terminal` и фиксирует реальные tool invocations. Native OpenAI-style `tool_calls` предпочтительны; узкий text fallback существует только для transport/template случаев, где корректный tool call сериализуется в message text.

Этот runner — control group, а не Nodus correctness test. Correctness/regression belongs to `test/`; benchmark сравнивает latency, model calls/tokens, tool behavior и итог задачи.

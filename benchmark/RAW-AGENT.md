# Raw agent benchmark

This benchmark intentionally bypasses Nodus planning, requirements, recovery, and execution orchestration.
It uses the same `nodus.config.json`, model endpoint, model settings, project root, and existing project tools.

Run the fixed `/status` benchmark task:

```bash
npm run benchmark:raw-agent -- nodus.config.json
```

Or provide another task after the config path:

```bash
npm run benchmark:raw-agent -- nodus.config.json "Your task here"
```

The runner exposes only `file-system`, `search`, and `terminal`, and reports every real tool invocation.
Native OpenAI-style `tool_calls` are preferred. A narrow `tool-name[ARGS]{...}` fallback exists only for KoboldCpp/Jinja transports that serialize an otherwise valid tool call into message text.


## Role in v0.3

This runner is a control group, not a Nodus test. It intentionally does not use `Engine`, `Planner`, `Research`, `DefaultWorker` or `ModelRunner` orchestration. It may reuse neutral provider configuration and the same low-level project tools so the comparison remains meaningful.

Keep benchmark results separate from `test/`: tests answer whether Nodus is correct; benchmarks compare cost, latency, calls/tokens and behavior against a raw-agent baseline.

# Nodus documentation

Current architecture documentation for Nodus v0.3.0:

- [Workflow architecture](./WorkflowArchitecture.md) — execution layers, workflow data catalog, requirement map, plan compiler, and source lifecycle.
- [Retrieval and requirement resolution](./RetrievalAndResolution.md) — `exact | related | missing`, child knowledge/capability-addition plans, recursion limits, and parent recheck.
- [Model response formats](./ModelResponseFormats.md) — the three wire formats (`json | raw | text`), parsers, and schema validation.
- [Testing](./TESTING.md) — maintained smoke tests, `/status` stage suite, and development loop.
- [Architecture summary](./ARCHITECTURE.md) — compact entry point to the current runtime.
- [Design principles](./DESIGN_PRINCIPLES.md) — working principles, observed properties, and hypotheses that still require benchmarks.
- [Benchmarks and experiments](./benchmarks/README.md) — behavioral comparison cases, including the raw-agent `/status` experiment.
- [MVP specification](./MvpSpecification.md) — historical v0.1 scope; useful as background, not the current execution contract.
- [Scenario: `/status`](./scenarios/status-command.md) — canonical integration scenario.

The active implementation roadmap lives at [`../ROADMAP.md`](../ROADMAP.md).

# Benchmarks and experiments

Benchmarks are behavioral test cases used to compare Nodus with simpler/raw agent execution. They are not production architecture contracts.

## Method

Keep as much as practical constant: model/settings, project state, user task, available files, and objective verification.

Record final correctness, compile/test result, model/tool calls, elapsed time/tokens when available, whether project facts were verified or guessed, and manual intervention.

A successful-looking diff is not sufficient. Objective verification and the trajectory used to obtain project facts are part of the result.

## Cases

- [`/status` and non-obvious API access](./status-command-raw-agent.md) — demonstrates a raw agent replacing project retrieval with a plausible API guess.

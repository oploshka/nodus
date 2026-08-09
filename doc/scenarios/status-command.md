# Canonical `/status` scenario

This is a regression contract for orchestration, not a hard-coded production plan.

The plan uses a small whitelist of concrete actions. `search` locates evidence; `understand` interprets it.

1. **search / find-examples** — subject: existing CLI command handling. Expected evidence: `src/cli/Cli.ts`, `COMMANDS`, `runCli`, and at least one existing command example.
2. **search / find-usages** — subject: `ProjectSession`, `ProjectIndex`, `projectId`, and `conversationId`. Expected result: directly usable existing source/access facts.
3. **understand / determine-integration** — connect the located CLI example and data sources to `/status` in `runCli`.
4. **prepare-change / define-change** — produce one minimal change plan targeting `src/cli/Cli.ts`.
5. **edit-file / apply-change** — one guarded file edit using preloaded target source.
6. **finalize / summarize-result** — report the result.

The semantic source of truth for a step is `type + action + subject + inputs + outputs`. The human-readable goal is derived from that contract.

Expected healthy behavior: search chooses retrieval tool calls only; the evidence evaluator decides satisfaction and missing evidence. No recovery is expected on the happy path.

# Canonical `/status` scenario

This is a regression contract for orchestration, not a hard-coded production plan. The model may phrase facts differently, but a healthy execution should follow the same logical shape.

1. **search** — locate `src/cli/Cli.ts` and establish how commands are registered/handled.
2. **search** — locate directly usable existing access paths for project ID, conversation ID, and indexed-file count. A property/access chain is sufficient; do not escalate the goal into finding a dedicated getter, service, CLI API, or HTTP API.
3. **understand** — connect those already-grounded facts to the `runCli` scope. This step should normally derive its output without broad new searching.
4. **prepare-change** — produce one minimal change plan targeting `src/cli/Cli.ts`.
5. **edit-file** — one guarded file edit using preloaded target source.
6. **finalize** — report the result.

Expected healthy behavior: no invented directories, no repeated search for alternate API shapes, no repeated read of the edit target, and no recovery on the happy path. Recovery is allowed only when concrete evidence is actually missing.

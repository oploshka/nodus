# Canonical `/status` scenario

`/status` is the primary end-to-end regression scenario for the v0.2 requirement-driven workflow.

Task contract:

- display current project ID;
- display current conversation ID;
- display the number of files in the **already available** project index when an index exists;
- reuse existing project APIs/structures;
- do not scan/refresh merely to answer `/status`;
- make no unrelated changes.

## Requirement graph

```text
evidence:project.id.definition
evidence:conversation.id.definition
evidence:project.index.files
evidence:project.index.currentAccess  [read-only, existing-state, no-side-effects]
        ↓
understand
        ↓
fact:project.id.access@cli
fact:conversation.id.access@cli
fact:project.index.fileCount.access@cli [must-not-scan-or-refresh, nullable]
fact:cli.command.pattern@cli
        ↓
change-definition:status.command
        ↓
change-result:status.command
        ↓
final-result:status.command
```

The compiled normal plan is four deterministic evidence searches, one semantic `understand`, deterministic `prepare-change` when all facts/target are available, one `edit-file`, and deterministic `finalize` after a concrete change result.

If exact evidence is missing, `related` evidence does not satisfy the requirement. Nodus may build a bounded child requirement plan for the missing data and then recheck the original parent requirement.

## Fast development mode

```bash
npm run dev -- nodus.config.json --clear-cache --clear-logs --scan --scenario=status
```

This bypasses manual task entry and initial requirement-planner latency by using the fixed scenario task and fixed `RequirementMap`, while still exercising the real `PlanCompiler` and execution runtime.

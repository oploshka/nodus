# Nodus Agent v0.2.0

Nodus is a developer-agent runtime built around explicit project state, typed workflow knowledge, deterministic execution where possible, and operation-scoped language-model reasoning.

Core principle: **Understand before you generate.**

```text
Task
 ↓
RequirementPlanner → RequirementMap
 ↓
PlanCompiler → TaskPlan
 ↓
PlanExecutor
 ├─ deterministic retrieval
 ├─ semantic understand/model calls where needed
 ├─ deterministic prepare/finalize fast paths
 ├─ tools / ChangeExecutor
 └─ bounded child requirement resolution / minimal capability-addition
```

Nodus/runtime is the agent. The model is an intellectual function inside controlled workflow algorithms.

## Quick start

```bash
npm install
cp nodus.config.example.json nodus.config.json
npm run dev -- nodus.config.json
```

On PowerShell:

```powershell
Copy-Item nodus.config.example.json nodus.config.json
```

For an OpenAI-compatible local endpoint, configure `model.provider`, `model.endpoint`, and `model.model` in `nodus.config.json`.

Useful startup overrides:

```bash
npm run dev -- nodus.config.json --clear-cache --clear-logs --scan
```

The canonical fast `/status` scenario skips manual task entry and requirement-planner latency:

```bash
npm run dev -- nodus.config.json --clear-cache --clear-logs --scan --scenario=status
```

For a direct baseline with the same model and project tools but without the Nodus requirement/planning pipeline, run the raw agent mode:

```bash
npm run dev -- nodus.config.json --clear-cache --clear-logs --scan --scenario=status --agent=raw
```

`--agent=raw` reuses the same configured OpenAI-compatible endpoint and model process. It runs a minimal native tool-calling loop with `file-system`, `search`, and `terminal`; the default mode remains the normal Nodus pipeline. The raw baseline prints the resolved project root and the canonical native tool calls it actually executed; textual tool-call transcripts emitted by the model are not treated as successful tool execution.

## Workflow data

The current runtime separates:

```text
Evidence → Fact → ChangeDefinition → ChangeResult → FinalResult
```

Raw source is transient operation input rather than durable workflow history. Typed refs such as `evidence:project.id.definition` and `fact:project.id.access@cli` make step dependencies explicit.

## Model response formats

Nodus uses three response wire formats: `json | raw | text`. The parser converts the wire response into validated internal objects. Large escaping-heavy operations such as `understand` and `edit-file` use the existing flat RAW `FIELD value` style; compact stable planners may continue to use JSON.

## Development

```bash
npm run typecheck
npm run test:core
```

Focused `/status` stage tests are available under `test/scenario/status`.

## Documentation

Start with [`doc/README.md`](doc/README.md). The active work list is [`ROADMAP.md`](ROADMAP.md).

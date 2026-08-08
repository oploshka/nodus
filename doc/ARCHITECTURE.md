# Nodus v0.1 — Architecture

```text
Conversation → Task → AgentRuntime → Execution → Result
                         │
                         ├── ProjectSession
                         │     └── Knowledge
                         ├── OperationRegistry
                         ├── ModelController → ModelAdapter → Local Model
                         ├── ToolRegistry
                         └── Logger
```

## Boundaries

- `Task` says what the user wants.
- `Execution` records what happened while solving one Task.
- `AgentRuntime` orchestrates the loop; it does not own project reasoning.
- `Operation` is an intellectual capability such as understand, implement, or review.
- `Tool` performs a concrete action or retrieves a fact.
- `ProjectSession` holds current project state and optional deterministic index/cache.
- `Knowledge` stores reusable understanding, patterns, decisions, and policies.
- `ModelController` knows how to invoke the model for a specific operation using the right prompt, context, policies, tools, and available operations.
- `verify` is an optional Operation in v0.1, not a separate verification engine.

## Execution loop

```text
Task
 ↓
plan
 ↓
ModelController
 ↓
OperationResult
 ├── toolCalls ──→ Tools ──→ same Operation with tool results
 ├── question ───→ Human ──→ same Operation with answer
 ├── changes ────→ FileSystemTool
 ├── nextOperation ─────────→ next Operation
 ├── failed ─────→ resolve-failure
 └── completed ──→ Result
```

The loop is bounded by `agent.maxSteps`.

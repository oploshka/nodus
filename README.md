# Nodus Agent v0.1

Nodus is a small, model-agnostic developer agent built around a persistent project session, explicit project knowledge, operation-specific prompts, tools, and a simple execution loop.

Core principle: **Understand before you generate.**

## MVP architecture

```text
Conversation
    ↓
Task
    ↓
AgentRuntime
    ├── ProjectSession
    ├── Knowledge
    ├── OperationRegistry
    ├── Tools
    └── Logger
    ↓
ModelController
    ↓
Local Model
    ↓
OperationResult
    ↓
AgentRuntime
    ↓
Result
```

The implementation deliberately keeps verification, context selection, knowledge generation, and planning simple. They are extension points, not separate heavy subsystems in v0.1.

## Quick start

```bash
npm install
cp nodus.config.example.json nodus.config.json
npm run dev -- nodus.config.json
```

On Windows PowerShell, copy the config with:

```powershell
Copy-Item nodus.config.example.json nodus.config.json
```

The example config uses the `mock` model provider, so the CLI starts without a running LLM. To use a local OpenAI-compatible endpoint, set:

```json
{
  "model": {
    "provider": "openai-compatible",
    "endpoint": "http://127.0.0.1:11434/v1",
    "model": "your-local-model"
  }
}
```

The adapter calls `<endpoint>/chat/completions`. This works with local servers that expose an OpenAI-compatible Chat Completions API.

Startup overrides can be passed after the config path:

```bash
npm run dev -- nodus.config.json --clear-cache --clear-logs --scan
```

- `--clear-cache` / `--keep-cache` override `project.clearCacheOnStart`.
- `--clear-logs` / `--keep-logs` override `logging.clearOnStart`.
- `--scan` forces a project scan on open for that run.

## CLI commands

- `/scan` — manually scan the project and save the index cache.
- `/refresh` — rescan the project.
- `/conversation` — show the active conversation id.
- `/new` — start a new conversation.
- `/exit` — exit.

Any other input becomes a Task in the active conversation.

## Knowledge

Knowledge is loaded from the configured JSON file and supports four entry types:

- `understanding`
- `pattern`
- `decision`
- `policy`

Each entry may define scope, applicability tags, source, confidence, priority, related entries, and related files. v0.1 primarily expects knowledge to be human-authored or pre-generated.

## Operations

Built-in operations:

- `search`
- `understand`
- `plan`
- `implement`
- `review`
- `verify`
- `resolve-failure`
- `extract-knowledge`

The model receives only currently registered operations. If it requests an unknown operation, Nodus logs `missing-operation` and falls back to `understand` when possible.

## Model response protocol

Nodus asks the model to return one JSON object. The important fields are:

```json
{
  "status": "continue",
  "message": "What I am doing",
  "nextOperation": "understand",
  "toolCalls": [],
  "changes": [],
  "question": null,
  "observations": []
}
```

A model may request tools, propose file changes, ask the user a question, move to another operation, complete the task, or fail.

## Project scanning

Scanning is intentionally optional. With `scanMode: "manual"`, opening a project only loads available knowledge and an existing cached project index. `/scan` or `/refresh` performs a deterministic scan later. Set `project.clearCacheOnStart` or pass `--clear-cache` to remove the cached index before opening. `--scan` can be combined with it to force a clean rescan.

The scanner records file metadata and simple import/export facts for common JS/TS/Vue files. It is not intended to be a full AST-based understanding system.

## Logging

Console logging is enabled by default. File logging writes JSONL and is optional. Full model payload logging is separately controlled by `logging.modelPayload` because prompts and responses can be large and may contain project code. Set `logging.clearOnStart` or pass `--clear-logs` to remove previous main/execution/payload logs before a new run.

## Build

```bash
npm run typecheck
npm run build
npm start -- nodus.config.json
```

`tsc-alias` rewrites TypeScript path aliases in the compiled output.

See `docs/MvpSpecification.md` for the frozen v0.1 scope.

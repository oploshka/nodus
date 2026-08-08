# Nodus v0.1 — MVP Specification

## Goal

Receive a user Task, use project state and project knowledge, select an intellectual Operation, invoke one local model with operation-specific prompt/policy/context, use Tools when needed, and produce a Result while recording Execution state and logs.

## Core entities

`Conversation` groups related Tasks. `Task` stores user intent. `Execution` stores the state and history of one Task. `AgentRuntime` orchestrates the execution loop. `ProjectSession` holds current project state, settings, optional index/cache, and Knowledge. `OperationRegistry` exposes intellectual capabilities. `ModelController` prepares model calls and normalizes model output. `ToolRegistry` exposes concrete environment actions.

## ProjectSession

Opening a project must work without an automatic scan. Manual `scan()` and `refresh()` are supported. Existing cache and manually-authored Knowledge may be loaded at startup.

## Knowledge

Knowledge types are Understanding, Pattern, Decision, and Policy. Entries support scope (`global`, `project`, `area`, `directory`, `file`), applicability tags, priority, source, confidence, status, related entries, and related files. Automatic knowledge generation is not required for v0.1.

## Operations

Initial operations: search, understand, plan, implement, review, verify, resolve-failure, extract-knowledge. Missing operations are logged. Profiles define a prompt id, context strategy, policy scopes, optional fallback, and enabled state.

## Model

v0.1 assumes one physical local model but multiple prompts. Model selection and prompt selection are separate concerns. An OpenAI-compatible adapter and a mock adapter are provided.

## Tools

Minimal tools: filesystem, terminal, git, and text search. Tools return facts or perform concrete actions; they do not own reasoning.

## Conversation context

The model receives recent Task/Result history plus a small slice of relevant project state and Knowledge. Full semantic retrieval is explicitly deferred.

## Human interaction

A model can ask a question. Execution moves to `waiting`, the human answer is recorded, and execution resumes.

## Verification

Verification is an optional operation with its own prompt. It may use terminal, git, filesystem, and search tools. No separate VerificationEngine exists in v0.1.

## Logging

Log task, execution, operation, model, tool, question, verification, missing-operation, error, and result events. Console logging is supported immediately; JSONL file logging is optional. Model request/response payloads use a separate debug flag.

## Out of scope

IDE plugin, embeddings/full RAG, mandatory deep scanning, automatic learning, sophisticated cache invalidation, multiple concurrently loaded models, a complex planner, a separate verification engine, and automatic generation of new technical tools.

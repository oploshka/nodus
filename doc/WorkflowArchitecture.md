# Workflow architecture

Core principle: **Understand before you generate.**

Nodus is the agent/runtime. The language model is an intellectual function invoked inside constrained algorithms; it does not own the execution loop.

## Main pipeline

```text
Task
 ↓
RequirementPlanner
 ↓
RequirementMap            semantic/data dependency graph
 ↓
PlanCompiler              deterministic compilation
 ↓
TaskPlan                  executable steps
 ↓
PlanExecutor
 ├─ deterministic retrieval
 ├─ ModelController where reasoning is required
 ├─ tools
 ├─ ChangeExecutor
 ├─ RequirementResolutionPlanner for missing requirements
 └─ execution state / reporting
```

`RequirementPlanner` works backward from the desired result. It describes **what must be known**, not which tool or step must run. `PlanCompiler` converts that graph into executable steps.

## Layer responsibilities

| Layer / step | Requires | Responsibility | Produces | Source/tool policy |
|---|---|---|---|---|
| `RequirementPlanner` | Task + project candidates | Describe desired result and required knowledge backward from the goal | `RequirementMap` | No execution tools |
| `PlanCompiler` | `RequirementMap` | Compile data dependencies into executable steps | `TaskPlan` | Deterministic |
| `PlanExecutor` | `TaskPlan` + `ExecutionContext` | Own execution order, attempts, postconditions, child-plan insertion, and state transitions | execution state | Deterministic orchestration; invokes model/tools only through operation boundaries |
| `RequirementResolutionPlanner` | one missing typed requirement + related evidence/facts | Build a bounded child requirement map; gather knowledge first, or add one minimal supporting capability when grounded absence requires it | child `RequirementMap` / child `TaskPlan` | No direct tools; parent requirement is rechecked afterward |
| `ExecutionContext` | completed typed step results | Store durable compact workflow data and provenance between steps | selected facts for the active step | Never stores full reusable source snapshots |
| `search` | Evidence contract + source hints | Locate concrete project evidence | `evidence:*` | Deterministic retrieval first |
| `understand` | `evidence:*`, optionally existing `fact:*` | Derive semantic project knowledge from grounded evidence | `fact:*` | May read known/referenced files only |
| `prepare-change` | `fact:*` | Turn established facts into a concrete change contract | `change-definition:*` | Deterministic fast path, model fallback |
| `edit-file` | `change-definition:*` + preloaded target source | Apply one concrete file change | `change-result:*` | Target source preloaded; no research loop |
| `review` | change result + relevant facts | Review correctness and scope | `review-result:*` | Focused review |
| `verify` | change result | Run objective checks when required | `verification-result:*` | Deterministic checks preferred |
| `finalize` | concrete result facts | Produce user-facing completion result | `final-result:*` | Deterministic when concrete result state is sufficient; model fallback for semantic/read-only answers |

## Workflow data catalog

| Kind | Question it answers | Example |
|---|---|---|
| `evidence` | Where is this visible in the project? | `evidence:project.id.definition` |
| `fact` | What does the grounded evidence establish? | `fact:project.id.access@cli` |
| `source` | What is the current raw content of a file? | transient `Cli.ts` contents |
| `change-definition` | What exactly should be changed? | `change-definition:status.command` |
| `change-result` | What change was actually applied? | `change-result:status.command` |
| `review-result` | Does the change satisfy review criteria? | `review-result:status.command` |
| `verification-result` | What did objective checks report? | `verification-result:status.command` |
| `final-result` | What should be reported to the user? | `final-result:status.command` |

The important boundary is:

```text
Evidence ≠ Fact ≠ Source ≠ ChangeDefinition
```

`Evidence` is grounded retrieval. `Fact` is semantic knowledge derived from evidence. Raw source is transient operation input, not durable workflow knowledge.

## Typed data references

Internally a reference separates data kind, semantic key, and optional scope:

```ts
interface WorkflowDataRef {
  kind: WorkflowDataKind;
  key: string;
  scope?: string;
}
```

Compact serialization is used in plans/logs:

```text
evidence:project.id.definition
fact:project.id.access@cli
change-definition:status.command
```

The prefix is a serialized data kind, not part of the semantic key.

## Step contracts

A step declares what it requires and produces. The runtime validates compatible data kinds before execution.

```text
search         produces evidence
understand     evidence/fact → fact
prepare-change fact → change-definition
edit-file      change-definition → change-result
review         change-result/fact → review-result
verify         change-result → verification-result
finalize       concrete result → final-result
```

Requirement contracts may also carry semantic constraints such as:

```text
read-only
existing-state
no-side-effects
nullable
must-not-scan-or-refresh
minimal-change
reuse-existing-api
no-unrelated-changes
```

Constraints are part of the knowledge contract. A fact that violates them must not satisfy the requirement.

## Source lifecycle

```text
search       → compact matches/snippets
understand   → may temporarily read known source files
Fact         → semantic value + evidence/provenance, not full source
prepare      → facts only
edit-file    → runtime preloads the complete target source
```

Full source is not copied through the workflow as conversation history.

## `/status` example

```text
evidence:project.id.definition ───────────────┐
evidence:conversation.id.definition ──────────┤
evidence:project.index.files ─────────────────┤
evidence:project.index.currentAccess ─────────┤
                                               ↓
                                           understand
                                               ↓
                         fact:project.id.access@cli
                    fact:conversation.id.access@cli
            fact:project.index.fileCount.access@cli
                         fact:cli.command.pattern@cli
                                               ↓
                                      prepare-change
                                               ↓
                               change-definition:status.command
                                               ↓
                                          edit-file
                                               ↓
                                  change-result:status.command
                                               ↓
                                           finalize
```

The current-index fact is constrained to existing read-only state; `scan()` or `refresh()` cannot satisfy it.

# Nodus v0.2 — Architecture summary

```text
Task
 ↓
RequirementPlanner → RequirementMap
 ↓
PlanCompiler → TaskPlan
 ↓
PlanExecutor
 ├─ deterministic retrieval
 ├─ ModelController for semantic reasoning
 ├─ tools / ChangeExecutor
 ├─ RequirementResolutionPlanner for missing typed requirements
 └─ ExecutionContext + reporting
```

Nodus/runtime is the agent. The model is a reasoning component inside controlled operations.

Current key boundaries:

- Requirement planning describes **what must be known**, not tool calls.
- `PlanCompiler` deterministically converts the requirement graph into executable steps.
- `search` produces evidence; `understand` converts grounded evidence into semantic facts.
- Typed `requires/produces` data contracts prevent layers from consuming the wrong data kind.
- `prepare-change` and `finalize` use deterministic fast paths when the necessary state is already explicit.
- Raw source is transient. Durable workflow context stores compact facts plus evidence/provenance.
- Missing typed requirements may create a bounded knowledge child plan or one minimal capability-addition child plan; the original parent requirement is rechecked afterward.

See [WorkflowArchitecture.md](./WorkflowArchitecture.md) for the full layer table and data-flow model, [RetrievalAndResolution.md](./RetrievalAndResolution.md) for retrieval branching and child plans, and [ModelResponseFormats.md](./ModelResponseFormats.md) for model wire formats.

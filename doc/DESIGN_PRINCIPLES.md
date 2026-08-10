# Nodus design principles

These are **working design principles**, not frozen architectural invariants. Nodus v0.2 is still evolving, so implementation details may change while these principles guide evaluation of new designs.

## Established properties and design direction

1. **The model is not the source of truth about the project.** Model output may contain hypotheses or semantic conclusions, but project facts should be grounded in retrieval/evidence or objective runtime state.
2. **Prefer deterministic runtime logic when the result is unambiguous.** Do not spend a model call on compilation, formatting, routing, or state transitions that ordinary code can perform reliably.
3. **Keep task state outside the model.** Requirements, evidence, facts, results, attempts, and recovery state belong to the runtime.
4. **Build context for the current operation.** Select the relevant task, facts, evidence, constraints, and eventually project/layer rules instead of asking the model to recover them from a large context.
5. **Separate intelligence from control.** The model handles semantic work; Nodus owns execution order, contracts, permissions, postconditions, retries, and state transitions.
6. **Capabilities should be scoped.** A model/operation should receive only the tools and mutation rights required for its role.
7. **Scale through decomposition rather than unlimited context growth.** Large work should be reducible to bounded requirements/subplans whose results are persisted and rechecked.

## Observed advantages

The current architecture already enables explicit typed workflow boundaries, deterministic fast paths, constrained evidence qualification, bounded missing-requirement recovery, parent recheck after child work, operation-specific context/formats, and future model/capability routing without giving the model ownership of the runtime loop.

## Hypotheses still requiring benchmarks

These are not yet proven:

- Nodus is more reliable than a raw agent across larger and more varied coding tasks.
- Controlled context assembly materially reduces failures as project/context size grows.
- Weaker/local models gain proportionally more from orchestration than stronger models.
- Multi-model routing improves quality/cost/security enough to justify its complexity.
- Decomposition remains efficient on large changes rather than creating excessive orchestration overhead.

Promote these to stronger claims only after repeatable test cases support them.

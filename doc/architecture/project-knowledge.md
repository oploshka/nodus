# Project knowledge

Project knowledge is persistent knowledge about the target project. It is intentionally separated from task-local execution context and from direct file retrieval.

## Categories

The first useful categories are intentionally narrow:

```text
ProjectKnowledgeWiki
  -> descriptive knowledge: what exists in the project and how parts are related

ProjectKnowledgeStandard
  -> normative knowledge: how new work should normally be done in this project

ProjectDecision
  -> reserved separately for now; its lifecycle and ownership are not classified yet
```

`ProjectKnow` is not used as a catch-all. If a new kind of knowledge does not fit the existing categories, it should first be classified instead of being stored in a generic bucket.

The categories differ not only by subject but also by what can be reliably derived from the repository:

- Wiki knowledge is often derivable from files, imports, configuration and documentation.
- Standards can sometimes be inferred from repeated patterns, but the current code can violate an intended standard; explicit project/user knowledge is stronger evidence.
- Decisions are often not recoverable from the final code at all, because code shows what was chosen but not necessarily why.

This distinction should constrain future resolvers instead of forcing every knowledge category through one acquisition strategy.

## Temporary acquisition strategy

Do not build a full resolver framework yet. For the first implementation:

```text
knowledge request
  -> configured / built-in knowledge
  -> persistent cache
  -> if missing: agent analyzes the project
  -> candidate knowledge
```

The agent is a temporary universal acquisition mechanism, not the architectural definition of the knowledge layer.

At minimum, acquired knowledge should retain its origin, for example `configured`, `cache` or `agent`, so inferred knowledge is not silently treated as an explicit project rule.

## User qualification

After the agent produces new project knowledge, Nodus may ask the user how strongly the result should be accepted. The conceptual states are:

```text
trusted
  -> explicitly trusted persistent knowledge
  -> reuse across tasks until there is a reason to revise it

accepted
  -> useful persistent AI-derived knowledge
  -> may later be revised or invalidated

temporary
  -> use only for the current task/execution
  -> do not persist as project knowledge

rejected
  -> do not use the proposed conclusion
```

A rejected result may eventually need to be retained as negative knowledge so the same agent conclusion is not repeatedly rediscovered. This is a future direction, not a requirement for the first implementation.

The approval policy may eventually differ by category: descriptive Wiki knowledge can be accepted more liberally, while normative Standards may require stronger user confirmation.

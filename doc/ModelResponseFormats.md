# Model response formats

Nodus distinguishes **wire format** from **result schema**.

```text
model response
  ├─ json
  ├─ raw
  └─ text
       ↓
parser
       ↓
JS value/object
       ↓
schema / operation validation
       ↓
operation result
```

The system intentionally does not create a separate custom mini-language for every operation.

Current operation mapping:

| Operation/path | Wire format | Notes |
|---|---|---|
| initial `RequirementPlanner` | `json` | compact/stable requirement graph |
| `RequirementResolutionPlanner` | `json` | small bounded child graph |
| search model fallback | `json` | lexical query suggestions only; Nodus owns tool calls |
| `understand` | `raw` | existing flat `FIELD value` style; avoids large escaping-heavy JSON |
| `prepare-change` | none on fast path, `json` fallback | deterministic when target + typed facts are complete |
| `edit-file` | `raw` | complete target source to EOF |
| `finalize` | none on fast path, `json` fallback | deterministic for concrete change/review/verification results |
| plain user value where no structure is required | `text` | no object schema needed |


## `json`

Use JSON where the response is compact, structured, and already stable.

Current examples:

- initial `RequirementPlanner`
- `RequirementResolutionPlanner`
- generic recovery/fallback operation results
- model fallback for `prepare-change` / `finalize` when deterministic compilation cannot handle the case

JSON parsing strips an optional markdown fence, parses one object, and validates required operation fields. Generic JSON repair remains available for JSON operations only.

## `raw`

Use RAW where large code/punctuation-heavy output makes JSON escaping expensive or fragile.

Current examples:

### `edit-file`

```text
STATUS completed
ACTION write
PATH src/cli/Cli.ts
CONTENT
<complete file content to EOF>
```

### `understand`

`understand` uses the same existing flat `FIELD value` style rather than a new envelope protocol:

```text
STATUS continue
ACTION read
PATH src/cli/Cli.ts
GOAL false
MISSING fact:cli.command.pattern@cli
```

or:

```text
STATUS completed
GOAL true
FACT fact:project.id.access@cli nodus.projectSession.projectId
EVIDENCE src/project/ProjectSession/ProjectSession.ts#projectId ProjectSession exposes projectId.
```

The parser converts this text into the same internal `OperationResult` / `StepResult` structures used elsewhere.

`understand` does not use JSON protocol repair. A malformed RAW response is an operation/protocol failure handled by the normal execution path.

## `text`

Plain text is appropriate when the model output itself is the final value and no structured machine fields are required. Deterministic finalization often avoids a model response entirely.

## Deliberately rejected

The experimental custom envelope form such as:

```text
<<<NODUS:1>>>
<<<STATUS completed>>>
...
<<<END>>>
```

was rejected. It added a new protocol without solving a requirement that the existing `FIELD value` RAW style could not solve.

## Principle

JSON is useful as machine storage/transport. RAW is useful for code-heavy or escaping-heavy outputs. Text is useful for unstructured values. Choose among those three formats; keep operation-specific differences in parsers/schemas rather than inventing new transport families.

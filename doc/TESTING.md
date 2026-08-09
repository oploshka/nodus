# Testing strategy

Nodus tests live outside production source code:

```text
src/   production code
test/  tests, fixtures, scenario harnesses
```

## Development loop

Prefer stage-level scenario tests over replaying a full model-driven task after every change.

For a known scenario, outputs of completed stages are represented as fixtures. A later stage test starts from those fixtures instead of rerunning planner/search/understand again.

Example for `/status`:

```text
plan fixture
   ↓
search stage test
   ↓ fixture facts
understand stage test
   ↓ fixture fact
prepare-change stage test
   ↓ fixture fact
edit-file stage test
   ↓ fixture result
finalize stage test
```

This separates two questions:

1. Does this workflow stage behave correctly?
2. Can the complete live model workflow solve the task end-to-end?

Use the first question during normal development. Run the full live workflow at checkpoints or when cross-stage behavior changed.

## /status scenario commands

```bash
npm run test:status:plan
npm run test:status:search
npm run test:status:understand
npm run test:status:prepare
npm run test:status:edit
npm run test:status:finalize
npm run test:scenario:status
```

`test:scenario:status` executes the independent stage suite. It does not require the earlier stages to be replayed to test a later stage.

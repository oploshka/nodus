# Testing strategy

Production code lives in `src/`; maintained tests live in `test/`.

The v0.2 suite prefers contract/stage smoke tests over replaying a slow live model task after every change.

## Core checks

```bash
npm run typecheck
npm run test:core
```

`test:core` covers the current architectural contracts:

- backward requirement-map compilation
- deterministic search request compilation
- `exact | related | missing` retrieval classification
- related evidence not satisfying a requirement
- child requirement resolution planning
- parent requirement recheck after both knowledge and capability-addition child plans
- understand RAW protocol and tool-round continuation
- file-system canonical action contract
- search prompt regression boundary
- canonical `/status` stage suite

## Focused commands

```bash
npm run test:plan:requirements
npm run test:search:compiler
npm run test:retrieval
npm run test:requirement:resolution
npm run test:requirement:recheck
npm run test:requirement:capability-recheck
npm run test:status:plan
npm run test:status:search
npm run test:status:understand
npm run test:status:prepare
npm run test:status:edit
npm run test:status:finalize
npm run test:scenario:status
```

## `/status` scenario

Each stage can be seeded from typed workflow fixtures:

```text
RequirementMap
   ↓
search evidence
   ↓
understand facts
   ↓
deterministic prepare-change
   ↓
edit-file
   ↓
deterministic finalize
```

The live scenario can still be run separately:

```bash
npm run dev -- nodus.config.json --clear-cache --clear-logs --scan --scenario=status
```

Stage smoke tests answer “does the runtime contract work?” The live run answers “does the current model produce good semantic facts?” They are intentionally separate.

## Removed historical tests

Old custom `NodusResponseProtocol` benchmarks and pre-production edit-protocol benchmark tests were removed. They tested abandoned protocol experiments rather than current runtime contracts and increased maintenance/context cost.

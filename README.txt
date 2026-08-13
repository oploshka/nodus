Nodus console logging update

Overlay these files onto the current project root.

Changed:
- src/app/Logging/Logger.ts: semantic console hierarchy, compact model progress, muted plan details.
- src/engine/Engine.ts: emits Planner/Determine orchestration boundary events.
- src/app/APPLICATION.md: documents the console output contract in Russian.
- test/unit/app/ConsoleLogger.test.ts: regression test for the new console contract.

This patch intentionally does not include unrelated project files, so it will not overwrite the current maxPlanSteps implementation or benchmark work.

Presentation migration v3

Extends the existing Presentation architecture to Planner, Determine, Research, Edit and Model.
Each role owns an independent concrete Presentation class. Presentation<TEvent> remains only the renderer contract; no shared semantic base class or formatter DSL was introduced.

ConsoleLogger now renders these runtime events through the presentation object carried by the emitter. ModelPresentation owns duration/token/finishReason formatting; ResearchPresentation owns question/result formatting; EditPresentation owns change-set/edit lifecycle formatting.

Validation in this environment:
- TypeScript transpile/syntax diagnostics: passed for all modified TS files.
- Full tsc --noEmit could not run because the provided snapshot has no @types/node/node_modules.

# First runtime run

The first end-to-end run should exercise the current Planner -> Determine -> Worker -> Research/attempt loop without depending on the old `/status` benchmark shape.

## Suggested task

> Сделай максимальное количество шагов Planner настраиваемым через `runtime.maxPlanSteps`.
> Сохрани текущее поведение по умолчанию: 8 шагов.
> `ConfigurationLoader` не должен задавать default — default должен оставаться в компоненте, который понимает его смысл.
> Передай значение через существующий composition/bootstrap слой.
> Обнови `nodus.config.example.json`.
> Не меняй другие runtime limits и не рефактори несвязанный код.

Why this task is useful for the first run:

- it is small enough to inspect manually;
- it should touch several architectural areas instead of one old CLI branch;
- it requires discovering where the current hard limit lives;
- it exercises configuration ownership and Bootstrap composition;
- a specialized CodeWorker should be a natural choice, while AgentWorker remains a real alternative for Determine.

## Launch on Windows

From the project root:

```powershell
Copy-Item nodus.config.example.json nodus.config.json
npm install
npm run dev -- nodus.config.json
```

KoboldCpp should be running at the endpoint configured in `nodus.config.json` (the example uses `http://localhost:5001/v1`).

When the CLI prompt appears, paste the suggested task as one input.

The project uses `scanMode: "on-open"` in the example configuration, so an explicit `/scan` is not required for the first run. `/scan` can still be used to refresh the index manually before a second attempt.

## What to capture

Keep the complete console log. The useful events include the generated plan, Worker candidates/selection, Worker attempts, Research requests, final status, and `engine.execution.sample`.

Do not tune the architecture after one odd response. A repeated failure shape across several runs is more useful than a single model mistake.

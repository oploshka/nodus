# Engine layer

`engine` — ядро Nodus. Здесь живёт логика выполнения coding-задачи, но не транспорт модели и не bootstrap приложения.

## Engine

`Engine.runTask()` — координатор цикла. В текущей версии он:

1. создаёт `Task`;
2. получает semantic `Plan` от Planner;
3. последовательно отдаёт `PlanStep` в DefaultWorker;
4. сохраняет результаты в `TaskRun`;
5. завершает run после конца плана или failed step.

Engine не должен принимать implementation decisions за Planner/Worker.

## Planner

Planner занимается только планированием пользовательской задачи:

- semantic goals;
- порядок/зависимости шагов;
- пользовательские constraints;
- возможный knowledge impact.

Planner не должен превращаться в Research: он не обязан выяснять конкретный API, читать большой набор файлов или готовить patch. Если для самого плана позже потребуется ограниченное знание, для этого нужен отдельный bounded contract.

## Research

Research отвечает на bounded question о проекте и хранит переиспользуемые ответы.

Текущий store записывает answer вместе с source paths и SHA-256. При повторном запросе hash каждого source проверяется; изменённый source делает entry stale.

Логически полезно различать project cache и знания, реально использованные конкретным TaskRun. Это ещё не оформлено отдельной сущностью.

## Worker

`DefaultWorker` выполняет один semantic `PlanStep`.

Он агрегирует:

- `ExecutionPlanner`;
- `ExecutionState`;
- список разрешённых `ExecutionAction`.

ExecutionPlanner видит только зарегистрированные actions. Worker дополнительно ограничивает число iterations и usage каждого action, поэтому модель не получает свободный agent loop.

Текущие actions:

- `research` — один bounded Research request;
- `edit-file` — одно сфокусированное изменение одного известного файла.

`edit-file` пока намеренно крупный action: внутри него находятся model proposal, response formatting, unified-diff apply и write. Не доказано, что patch/apply/commit должны становиться отдельными ExecutionAction.

## Validation

Validation планируется отдельной engine-подсистемой, но пока не реализуется. `ExecutionPlanner: completed` означает только завершение локальной работы Worker и не является доказательством выполнения пользовательского task contract.

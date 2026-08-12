# Architecture 0.3

Текущая архитектура намеренно строится с нуля вокруг трёх верхних слоёв.

## Зависимости

- `app` зависит от `engine` и `model` и собирает их через DI;
- `engine` может использовать `model`;
- `model` не зависит от `engine` или `app`.

Таким образом transport/provider code не знает о task lifecycle, а Engine не знает, как именно создаются provider adapters или log sinks.

## Task path

1. app вызывает `Engine.runTask(description)`;
2. Engine просит Planner построить semantic Plan;
3. каждый PlanStep получает DefaultWorker;
4. ExecutionPlanner выбирает только зарегистрированный ExecutionAction;
5. `research` обращается к Research cache/resolver;
6. `edit-file` вызывает ModelRunner и получает уже parsed edit object;
7. Worker сохраняет ActionResult в ExecutionState history;
8. Engine сохраняет WorkerResult в TaskRun.

Validation пока сознательно отсутствует. Completion Worker не равен доказанной корректности всей пользовательской задачи.

Подробности лежат рядом с кодом слоя:

- [`../src/app/APPLICATION.md`](../src/app/APPLICATION.md)
- [`../src/engine/ENGINE.md`](../src/engine/ENGINE.md)
- [`../src/model/MODEL.md`](../src/model/MODEL.md)
- [`../test/TESTING.md`](../test/TESTING.md)

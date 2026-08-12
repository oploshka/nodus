# Architecture 0.3

Текущая архитектура намеренно строится с нуля вокруг трёх верхних слоёв.

## Зависимости

- `app` зависит от `engine` и `model` и собирает их через DI;
- `engine` может использовать `model`;
- `model` не зависит от `engine` или `app`.

Таким образом transport/provider code не знает о task lifecycle, а Engine не знает, как именно создаются provider adapters или log sinks.

## Task path

1. app вызывает `Engine.run(description)`;
2. Engine просит Planner построить global Plan;
3. для очередного PlanStep Engine через Determine выбирает подходящий Worker;
4. Worker получает управление задачей шага и сам ведёт ограниченный внутренний цикл выполнения;
5. Worker сначала пытается выполнить шаг, а при конкретной нехватке знаний обращается к Research и повторяет исходную задачу;
6. Worker возвращает Engine только `completed`, `not-completed` или `failed`; внутреннее knowledge/state остаётся внутри экземпляра Worker;
7. только `completed` двигает global Plan дальше;
8. Engine сохраняет WorkerResult в TaskRun.

Validation пока сознательно отсутствует. Completion Worker не равен доказанной корректности всей пользовательской задачи.

Подробности лежат рядом с кодом слоя:

- [`src/app/APPLICATION.md`](../src/app/APPLICATION.md)
- [`src/engine/ENGINE.md`](../src/engine/ENGINE.md)
- [`src/model/MODEL.md`](../src/model/MODEL.md)
- [`test/TESTING.md`](../test/TESTING.md)

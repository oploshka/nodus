# Scenario: /status

Канонический простой vertical slice для текущего 0.3 runtime:

> Добавить `/status` в CLI. Команда выводит текущий project id, conversation id и число файлов уже существующего индекса. Нельзя запускать scan/refresh только ради отображения status и нельзя менять лишнее.

Сценарий используется не как универсальная спецификация Nodus, а как небольшой повторяемый контракт для проверки архитектуры.

Текущая deterministic последовательность:

1. Planner формирует один semantic PlanStep;
2. ExecutionPlanner выбирает bounded `research`;
3. Research возвращает существующие access paths/patterns;
4. ExecutionPlanner выбирает `edit-file`;
5. ModelRunner форматирует model response в typed edit object;
6. patch applicator применяет unified diff;
7. ExecutionPlanner завершает Worker.

Integration test хранится в `test/integration/status`. Тот же Scenario contract должен позже использоваться real-model test, чтобы deterministic runtime и LLM сравнивались на одинаковой задаче.

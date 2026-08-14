# Scenario: /status

Канонический простой vertical slice для текущего 0.3 runtime:

> Добавить `/status` в CLI. Команда выводит текущий project id, conversation id и число файлов уже существующего индекса. Нельзя запускать scan/refresh только ради отображения status и нельзя менять лишнее.

Сценарий используется не как универсальная спецификация Nodus, а как небольшой повторяемый контракт для проверки архитектуры.

Текущая deterministic последовательность:

1. Planner формирует один semantic PlanStep;
2. Determine выбирает `CodeWorker` из доступных Worker;
3. Worker сразу делает первую попытку выполнить PlanStep;
4. попытка возвращает конкретный `missing-information`;
5. Worker получает bounded Research-ответ и повторяет исходную задачу с накопленным knowledge;
6. следующая попытка формирует минимальный edit и применяет unified diff;
7. Worker возвращает Engine только итоговый `completed`.

Integration test хранится в `test/integration/status`.

# Nodus 0.3

Nodus — экспериментальный runtime для управляемого coding-agent. Цель текущей ветки — вынести orchestration из модели и оставить LLM ограниченные, хорошо подготовленные решения.

Текущая архитектура строится вокруг трёх верхних слоёв: `app` собирает и запускает приложение, `engine` координирует выполнение задачи, `model` изолирует работу с LLM и её wire-протоколами.

Сейчас основной runtime уже включает semantic Planner, bounded Research, `DefaultWorker` с локальным `ExecutionPlanner`, actions `research` / `edit-file` и единый `ModelRunner`. Validation как отдельный слой пока намеренно не реализована.

## Документация

### Проект

- [Архитектура](doc/ARCHITECTURE.md)
- [Соглашения проекта](doc/CONVENTIONS.md)
- [Roadmap](doc/ROADMAP.md)
- [Заметки](doc/NOTES.md)
- [Сценарий `/status`](doc/STATUS-SCENARIO.md)

### Слои

- [Application](src/app/APPLICATION.md)
- [Engine](src/engine/ENGINE.md)
  - [Planner](src/engine/Planner/PLANNER.md)
  - [Worker](src/engine/Worker/WORKER.md)
- [Model](src/model/MODEL.md)
  - [Response formats](src/model/RESPONSE-FORMATS.md)

### Тестирование и benchmark

- [Тестирование](test/TESTING.md)
- [Model tests](test/model/MODEL_TESTS.md)
- [E2E tests](test/e2e/E2E_TESTS.md)
- [Benchmark](doc/BENCHMARKS.md)
- [Raw-agent benchmark](benchmark/RAW-AGENT.md)

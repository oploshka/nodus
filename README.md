# Nodus 0.3

Nodus — экспериментальный runtime для управляемого coding-agent. Проект исследует подход, при котором orchestration выносится из LLM, а модель получает ограниченные и хорошо подготовленные задачи.


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

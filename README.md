# Nodus 0.3

Nodus — экспериментальный runtime для управляемого coding-agent. Основная идея текущего spike: выносить из LLM те части execution, которые можно сделать явными и контролируемыми, оставляя модели ограниченные задачи с понятными контрактами.

Текущий runtime строится вокруг `Engine -> Planner -> Determine -> Worker`, bounded Research, Engine-owned Edit и отдельной Validation boundary. Проект остаётся экспериментальным: архитектурные границы проверяются реальными задачами и benchmark'ами, а не считаются compatibility contract заранее.

## Быстрый старт

```bash
npm install
npm run test:unit
npm run test:integration
npm run dev -- nodus.config.json --clear-cache --clear-logs --scan
npm run dev:project
```

Для локальной модели example config ожидает OpenAI-compatible endpoint. Полный runtime log создаётся в `.nodus/logs/`.

## Документация

Документация разделена по статусу знания:

- [`doc/architecture/`](doc/architecture/) — как Nodus работает сейчас;
- [`doc/development/`](doc/development/) — roadmap, benchmark practice и активная разработка;
- [`doc/project/`](doc/project/) — conventions и правила документации;
- [`doc/history/`](doc/history/) — прошлые состояния и сценарии;
- [`doc/research/`](doc/research/) — гипотезы и ещё не утверждённые направления.

Правила структуры, языка и именования описаны в [`doc/project/documentation.md`](doc/project/documentation.md).

### Основные документы

- [Current state / handoff](doc/architecture/current-state.md)
- [Architecture](doc/architecture/architecture.md)
- [Engine](doc/architecture/engine.md)
- [Application](doc/architecture/application.md)
- [Model](doc/architecture/model.md)
- [Validation](doc/architecture/validation.md)
- [Roadmap](doc/development/roadmap.md)
- [Project conventions](doc/project/conventions.md)
- [Project evolution](doc/history/evolution.md)
- [Architecture evolution / research](doc/research/architecture-evolution.md)

### Тестирование и benchmark

- [Target workspace](target/target-workspace.md)
- [Test framework](target/test-framework/test-framework.md)
- [Testing](test/TESTING.md)
- [Model tests](test/model/MODEL_TESTS.md)
- [E2E tests](test/e2e/E2E_TESTS.md)
- [Benchmarking](doc/development/benchmarking.md)
- [Raw-agent benchmark](target/benchmark/RAW-AGENT.md)
- [Model capabilities](target/benchmark/model-capabilities/model-capabilities.md)

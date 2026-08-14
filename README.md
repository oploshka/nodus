# Nodus 0.3

Nodus — экспериментальный runtime для локальных coding-моделей. Проект исследует, где должна проходить граница между semantic reasoning модели и обязанностями, которые надёжнее выполнять или контролировать на уровне runtime. Для решений, остающихся за моделью, отдельная задача Nodus — предоставить релевантное понимание конкретного проекта: существующие реализации, ограничения, соглашения и другие знания, необходимые для задачи.

Nodus не предполагает, что правильное разделение ответственности между моделью и runtime известно заранее. Текущие границы `Engine`, `Planner`, `Determine`, `Worker`, `Research`, Engine-owned Edit и Validation являются результатом экспериментов и продолжают проверяться реальными задачами и benchmark'ами.

Подробнее исходная мотивация и две исторические линии проекта — runtime control и Project Understanding — описаны в [`doc/history/origin.md`](doc/history/origin.md).

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
- [`doc/history/`](doc/history/) — происхождение проекта, архитектурная эволюция и прошлые сценарии;
- [`doc/research/`](doc/research/) — гипотезы и ещё не утверждённые направления.

Правила структуры, языка и именования описаны в [`doc/project/documentation.md`](doc/project/documentation.md).

### Основные документы

- [Текущее состояние](doc/architecture/current-state.md)
- [Архитектура](doc/architecture/architecture.md)
- [Application](doc/architecture/application.md)
- [Engine](doc/architecture/engine.md)
- [Planner](doc/architecture/planner.md)
- [Worker](doc/architecture/worker.md)
- [Edit](doc/architecture/edit.md)
- [Model](doc/architecture/model.md)
- [Validation](doc/architecture/validation.md)
- [Roadmap](doc/development/roadmap.md)
- [Conventions проекта](doc/project/conventions.md)
- [Происхождение Nodus](doc/history/origin.md)
- [Эволюция проекта](doc/history/evolution.md)
- [Архитектурная эволюция / research](doc/research/architecture-evolution.md)

### Тестирование и benchmark

- [Target workspace](target/target-workspace.md)
- [Test framework](target/test-framework/test-framework.md)
- [Testing](test/testing.md)
- [Model tests](test/model/model-tests.md)
- [E2E tests](test/e2e/e2e-tests.md)
- [Benchmarking](doc/development/benchmarking.md)
- [Raw-agent benchmark](target/benchmark/raw-agent.md)
- [Model capabilities](target/benchmark/model-capabilities/model-capabilities.md)

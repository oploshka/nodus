# Nodus 0.3

Nodus — экспериментальный runtime для управляемого coding-agent. Основная идея текущей ветки: вынести orchestration из LLM, оставить модели ограниченные задачи с явными контрактами и дать runtime возможность контролировать планирование, исполнителей, действия, Research и взаимодействие с пользователем.

Сейчас проект находится в активном архитектурном spike. Код уже проходит через `Engine -> Planner -> Determine -> Worker -> Action`, но ряд границ намеренно ещё считается экспериментальным: Validation, продолжение `not-completed`, user interaction/control points, разделение internal storage и model-editable paths, а также централизованная языковая policy.

## Быстрый старт

```bash
npm install
npm run test:unit
npm run test:integration
npm run dev -- nodus.config.json --clear-cache --clear-logs --scan
```

Для локальной модели example config ожидает OpenAI-compatible endpoint. Полный runtime log создаётся в `.nodus/logs/` и предназначен для разбора model request/response и execution trace.

## Документация

### Текущее состояние

- [Current state / handoff](doc/CURRENT-STATE.md)
- [Architecture](doc/ARCHITECTURE.md)
- [Roadmap](doc/ROADMAP.md)
- [Current design questions](doc/NOTES.md)
- [Project conventions](doc/CONVENTIONS.md)
- [Console output contract](doc/CONSOLE-OUTPUT.md)

### Слои

- [Application](src/app/APPLICATION.md)
- [Engine](src/engine/ENGINE.md)
  - [Planner](src/engine/Planner/PLANNER.md)
  - [Worker / Actions](src/engine/Worker/WORKER.md)
- [Model](src/model/MODEL.md)
  - [Response formats](src/model/RESPONSE-FORMATS.md)

### Тестирование и benchmark

- [Testing](test/TESTING.md)
- [Model tests](test/model/MODEL_TESTS.md)
- [E2E tests](test/e2e/E2E_TESTS.md)
- [Benchmarks](doc/BENCHMARKS.md)
- [Raw-agent benchmark](target/benchmark/RAW-AGENT.md)

### Исторические/сценарные заметки

- [Status scenario](doc/STATUS-SCENARIO.md)

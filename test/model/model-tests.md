# Model tests

Тесты с реальной моделью используют тот же `target/test-framework` и Scenario contracts, что deterministic integration suite.

При передаче real `ModelAdapter` ScenarioRunner оборачивает его в `LoggedModelAdapter`, поэтому request/response попадают в тот же timestamped scenario log, что Engine/Worker/Research events.

Запуск намеренно последовательный:

```bash
npm run test:model
```

Model tests не должны менять Scenario contract только ради конкретной модели; model-specific настройки передаются через configuration/harness.

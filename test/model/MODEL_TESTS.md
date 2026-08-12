# Model tests

Тесты с реальной моделью используют тот же `test/framework` и Scenario contracts, что deterministic integration suite.

При передаче real `ModelAdapter` ScenarioRunner автоматически оборачивает его в `LoggedModelAdapter`, поэтому request/response попадают в тот же timestamped scenario log, что Engine/Worker/Research events.

Запуск намеренно последовательный:

```bash
npm run test:model
```

Model tests не должны менять сам Scenario contract только ради конкретной модели; model-specific настройки передаются через configuration/harness.

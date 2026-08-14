# Mock targets and test doubles

`target/mock` содержит небольшие искусственные targets, fixtures и повторно используемые test doubles, которые помогают изолированно проверять поведение Nodus.

Это не test runner и не scenario harness:

- полноценный disposable проект для ручных прогонов лежит в `target/project`;
- Nodus-specific scenario harness лежит в `target/test-framework`;
- обычные unit/integration/model/e2e тесты лежат в `test/`.

Mock-объект стоит выносить сюда, когда он имеет самостоятельный смысл вне одного конкретного теста. Например, `WorkerTestContext` собирает типизированные `WorkerRunData`, `WorkerInstrument` и task-local Edit mock для unit-тестов Worker.

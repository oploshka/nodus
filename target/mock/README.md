# Mock targets

`target/mock` предназначен для небольших искусственных targets и fixtures, которые помогают изолированно проверять поведение Nodus.

Это не место для полноценного disposable проекта и не test runner:

- полноценный проект для ручных прогонов лежит в `target/project`;
- Nodus-specific scenario harness лежит в `target/test-framework`;
- обычные unit/integration/model/e2e тесты лежат в `test/`.

Папка намеренно пока почти пустая. Новые mock-объекты стоит добавлять сюда только когда они имеют самостоятельный смысл вне одного конкретного теста.

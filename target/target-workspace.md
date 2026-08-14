# Target

`target/` содержит внешние и вспомогательные объекты, на которых Nodus проверяется и экспериментирует. Это не production runtime.

- `benchmark/` — измерительные и capability-прогоны;
- `project/` — disposable реальный проект, над которым можно безопасно запускать Nodus;
- `mock/` — небольшие искусственные targets/fixtures, не являющиеся полноценным проектом;
- `test-framework/` — Nodus-specific scenario harness и test runtime infrastructure поверх Vitest.

Обычные unit/integration/model/e2e тесты самого Nodus остаются в `test/`.

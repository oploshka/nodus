# Nodus Test Framework

`target/test-framework` — Nodus-specific execution harness поверх Vitest. Это не набор тестов и не generic testing library.

Он даёт тестам управляемую среду выполнения Nodus:

- `Scenario` описывает task, project fixture, runtime configuration и scripted model responses;
- `ScenarioRunner` собирает приложение через обычный Bootstrap и запускает `Engine.run()`;
- `TestProject` создаёт временный файловый target;
- `QueueModelAdapter` даёт deterministic model transport;
- `LoggedModelAdapter` сохраняет model traffic;
- `TestFileLogger` пишет человекочитаемую execution trace.

Assertions и test lifecycle остаются ответственностью Vitest и файлов из `test/`.

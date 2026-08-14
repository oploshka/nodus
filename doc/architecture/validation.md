# Validation

Validation — отдельная Engine-owned граница между результатом выполнения шага и окончательным `completed` для этого шага.

Текущая реализация намеренно минимальна: `PassValidator` всегда возвращает `{ status: 'passed' }`. Его задача сейчас — закрепить место Validation в lifecycle, а не заранее выбрать конкретные проверки.

Текущий поток:

```text
Worker
  -> prepared result / changes
Engine
  -> Edit commit (если есть изменения)
  -> Validation
  -> completed PlanStep
```

## TODO

Контракт Validation ещё не определён окончательно. Перед добавлением реальных validators нужно решить по фактическим сценариям:

- какие проверки выбираются для конкретной задачи: typecheck, tests, lint, config/schema parsing, command, project-specific checks;
- должен ли Validator получать только `WorkerResult` или также подготовленный/изменённый project state;
- как несколько validators комбинируются и какие из них обязательны;
- как Validation сообщает `not-completed`, исправимый failure и hard failure;
- должна ли неуспешная Validation инициировать Worker retry / отдельный recovery flow;
- когда validation запускается для шага без файловых изменений;
- как Validation работает с будущим Engine-owned virtual workspace;
- должна ли Validation выполняться до физического commit, после commit или в два этапа;
- как откатывать уже применённые изменения, если post-commit validation не прошла;
- какие validation details показываются пользователю, а какие остаются только в diagnostic log;
- как собирать duration/result статистику Validation без дополнительных model calls.

До появления этих требований `PassValidator` остаётся единственной runtime-реализацией и не выполняет скрытых проверок.

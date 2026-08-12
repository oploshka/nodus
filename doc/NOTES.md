# Current design questions

Рабочие вопросы текущего 0.3 spike. Для восстановления общего контекста сначала см. `CURRENT-STATE.md`.

1. **Internal storage.** `.nodus` нужен самому Nodus для cache/index/logs, но не должен быть model-editable. Сейчас это временно не разделено.
2. **Language policy.** Три языка уже есть в config; нужно перенести базовый internal-language enforcement в model layer и оставить English default.
3. **Worker continuation.** `not-completed` означает возможность продолжить, но настоящего resume того же Worker instance пока нет.
4. **Interaction.** Engine должен стать двунаправленным control channel между Worker и пользователем, без UI logic внутри Worker.
5. **Worker specialization.** Проверять реальные границы `CodeWorker / DocumentationWorker / AgentWorker`; не плодить типы заранее.
6. **Action set.** Новые Actions вводить только когда capability повторяется как отдельный ясный contract.
7. **Research cache precision.** Resolver пока может привязать answer ко всем прочитанным candidate files, а не только к фактически использованным evidence.
8. **Planner bounded research.** Возможно понадобится 1–2 факта для самой semantic decomposition, но это не должно превращать Planner в implementation research.
9. **Validation.** Отдельный слой нужен позже; текущий Worker completed не равен validated task.
10. **Experience data.** Execution samples потенциально могут улучшать Determine и показывать, какие типы задач стоит оптимизировать специализированными Worker/Actions.

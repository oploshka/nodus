# Current design questions

Это рабочие вопросы текущего 0.3 spike, а не обязательные архитектурные правила.

1. **Worker continuation.** `not-completed` сохраняет внутреннее knowledge Worker; нужно определить, какие дополнительные команды Engine сможет дать тому же экземпляру позже.
2. **Worker specialization.** Сейчас есть `CodeWorker` и `DocumentationWorker`; следующие реальные сценарии должны показать, где проходит полезная граница между Worker-типами.
3. **Attempt contract.** Внутренний `WorkerAttempt` различает только `completed / missing-information / failed`; техническая ошибка попытки остаётся исключением и расходует локальный attempt budget.
4. **Research cache precision.** Source-hash invalidation работает, но resolver пока может привязать answer ко всем прочитанным candidate files.
5. **Planner research.** High-level Planner пока не исследует проект. Если для корректной декомпозиции понадобится 1–2 факта, нужен отдельный bounded planning-research contract.
6. **Validation.** Должна стать отдельной engine-подсистемой, но только после появления реального validation contract.

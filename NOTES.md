# Current design questions

Это рабочие вопросы текущего 0.3 spike, а не обязательные архитектурные правила.

1. **ExecutionState ownership.** Пока Worker записывает `ActionResult` в history. Нужно проверить, достаточно ли этого, когда actions станут сложнее.
2. **Action granularity.** На `/status` `research + edit-file` выглядит лучше, чем выставлять patch/apply/commit наружу. Нужен второй scenario.
3. **Research cache precision.** Source-hash invalidation работает, но resolver пока может привязать answer ко всем прочитанным candidate files.
4. **Planner research.** High-level Planner пока не исследует проект. Если для корректной декомпозиции понадобится 1–2 факта, нужен отдельный bounded planning-research contract.
5. **Validation.** Должна стать отдельной engine-подсистемой, но только после появления реального validation contract.
6. **ModelRunner.** Все runtime model calls уже проходят через него; следующий шаг — проверить, какие общие context/prompt policies действительно стоит централизовать в runner, не превращая его в новый старый ModelController.

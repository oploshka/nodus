# Журнал архитектурных решений

Это лёгкий decision log, а не формальный ADR framework. Здесь фиксируются только решения, которые заметно меняют границы ответственности или объясняют форму текущей архитектуры.

Исторический документ не заменяет `doc/architecture/`: если решение позже пересмотрено, запись сохраняется и получает новый статус.

## Engine-owned Edit

**Статус:** принято в текущей архитектуре.

**Проблема.** Worker одновременно определял semantic изменение и был слишком близок к техническому формату его материализации. Ошибка diff/range-replace могла провоцировать повторное semantic reasoning, хотя intent задачи не изменился.

**Решение.** Worker возвращает semantic `ProjectEditRequest`, а Engine-owned `ProjectEditor` владеет authoritative source, `EditStrategy`, applicator, technical recovery/fallback, buffered state и commit.

**Причина.** Ошибка выражения/применения изменения и ошибка понимания задачи — разные failure classes. Runtime может повторять или менять техническую стратегию, не заставляя Worker заново решать semantic задачу.

**Не означает.** Что модель полностью исключена из Edit: отдельные EditStrategy могут использовать model call для materialization.

## Validation как lifecycle boundary до полной реализации

**Статус:** принято; реальная validation policy ещё открыта.

**Проблема.** Если сначала проектировать полный validation/recovery framework, легко построить сложную систему до появления реальных failure cases. Но отсутствие самой boundary затрудняет дальнейшее развитие lifecycle.

**Решение.** Ввести Engine-owned Validation boundary с `PassValidator`, который пока всегда возвращает `passed`.

**Причина.** Сначала закрепить ownership и место в lifecycle, затем добавлять validators и failure semantics из реальных задач.

## Semantic Planner вместо technical phase plan

**Статус:** принято в текущей архитектуре.

**Проблема.** Декомпозиция по файлам, слоям, Research/Validation или другим implementation phases создаёт искусственные steps и переносит execution mechanics в high-level plan.

**Решение.** `PlanStep` описывает semantic outcome и constraints. Split требует semantic причины (`independent-outcome`, `dependency`, `separate-deliverable`), а не просто технического этапа.

**Причина.** Coherent пользовательское изменение должно оставаться coherent unit даже если реализация затрагивает несколько файлов или подсистем.

## Research только по concrete missing information

**Статус:** принято в текущей архитектуре.

**Проблема.** Обязательный широкий research перед каждым действием увеличивает trajectory и заставляет runtime заранее угадывать, какая информация понадобится Worker.

**Решение.** Worker/Action формулирует bounded Research request, когда для semantic решения действительно обнаружено missing information.

**Причина.** Research должен отвечать на конкретную потребность исполнения, а не становиться обязательной generic phase.

## Project Understanding не строить заранее как большую subsystem

**Статус:** текущее исследовательское ограничение, не отказ от идеи.

**Проблема.** Ранние Project Knowledge/Context/Policy/Pattern concepts быстро порождали большую архитектуру до достаточного числа реальных задач и failure cases.

**Решение.** Сохранить Project Understanding как first-class проблему, но не возвращать прежние сложные abstractions без подтверждённой необходимости. Собирать реальные случаи, где текущего Research/context недостаточно.

**Причина.** Проблема выглядит устойчивой; конкретное решение пока нет.

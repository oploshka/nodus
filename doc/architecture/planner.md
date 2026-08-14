# Planner

Planner — high-level semantic planner Engine. Его задача намеренно узкая: превратить пользовательский `Task` в небольшой `Plan`.

`PlanStep` описывает **какой outcome должен быть достигнут**, а не технический способ реализации.

Например, для `/status` Planner может вернуть один coherent step с целью добавить требуемое observable behavior и constraints не менять unrelated behavior и не запускать лишний refresh только ради отображения статуса.

Planner не обязан знать, в каком файле находится реализация, какие API потребуется вызвать или какой EditStrategy будет использован. Это execution/research concerns.

## Limited knowledge during planning

В будущем Planner может получать небольшой bounded project context, когда без него невозможно выбрать semantic decomposition. Это не должно превращать Planner в implementation research: он не должен исследовать проект до тех пор, пока сам не сможет реализовать step.

## Knowledge impact

`PlanStep.knowledgeImpact` — optional invalidation hint для знаний, которые могут устареть после изменения Project. Он не является инструкцией Worker заранее исследовать эти знания.

## Decomposition

Planner делит задачу по semantic outcomes, а не по implementation mechanics. Отдельный `PlanStep` оправдан одной из причин:

- `coherent-outcome` — отдельной причины для split нет;
- `independent-outcome` — outcome может независимо завершиться успехом или failure;
- `dependency` — более поздний requested outcome невозможно разумно выполнять до предыдущего;
- `separate-deliverable` — пользователь ожидает отдельно наблюдаемый результат.

Файлы, архитектурные слои, Research, Validation, configuration flow и другие technical phases сами по себе не являются причинами создавать отдельный step. Условия корректности outcome принадлежат `constraints`.

Текущая decomposition semantics ещё проверяется реальными задачами. Nested steps, replanning и более сложные отношения между steps не являются частью текущего contract.

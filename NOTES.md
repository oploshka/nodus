# Вопросы после spike

## 1. Action granularity

Сейчас `edit-file` — крупный Action, внутри которого скрыты proposal/diff/apply/write. Это уменьшает пространство решений ExecutionPlanner и выглядит полезным для слабых моделей.

Нужно проверить на multi-file задаче, останется ли такая гранулярность удобной.

## 2. Кто определяет completion

Сейчас `ExecutionPlanner` возвращает `STATUS completed`. Worker принимает это как завершение PlanStep. После появления Validation это, вероятно, должно означать только `worker finished`, а не `step proven correct`.

## 3. ExecutionState

Пока state = task + step + iteration + action history. Это намного проще прежней phase-machine.

Проблема появится, когда history станет большой. Тогда, вероятно, понадобятся typed artifacts или компактное derived state, но добавлять их заранее не стоит.

## 4. Research dependency precision

Hash invalidation работает. Но resolver сейчас прикрепляет к answer все прочитанные candidate files. Это безопасно, но может часто инвалидировать cache. Более точный evidence set можно добавить позже.

## 5. Planner research

Planner пока вообще не исследует проект. Это сознательно. Если появится задача, которую нельзя разумно декомпозировать без одного-двух фактов, нужен отдельный bounded planning-research contract, а не доступ Planner к общему research loop.

## 6. Test framework

Test runner теперь внешний (`vitest`), а `test/framework` содержит только Nodus-specific harness. Это намеренно: framework не дублирует `test/describe/expect/mock`, а отвечает за Project fixture, scenario setup, model harness и единый execution log.

Trace не является отдельным storage. В тестах обычный Logger подменяется `TestFileLogger`, а model adapter оборачивается/заменяется harness-адаптером, поэтому один timestamped `.log` содержит runtime events и model payloads по порядку.

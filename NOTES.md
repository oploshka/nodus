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

# Каталог failure classes

**Статус:** рабочий research-документ.

Цель каталога — фиксировать повторяющиеся классы проблем, а не отдельные bugs. Новый failure class может стать причиной benchmark, prompt change, runtime constraint, Action или архитектурной границы; сам факт записи ещё не определяет решение.

## Edit expression failure

Модель понимает требуемое semantic изменение, но не может корректно выразить его в выбранном edit contract или результат не применяется технически.

Важно отделять от semantic failure. Возможные измерения: schema/contract success, apply success, semantic correctness.

## Generic solution вместо project-specific solution

Решение технически возможно, но игнорирует существующий project mechanism, pattern, inheritance, storage convention или архитектурную причину и фактически изобретает параллельную реализацию.

Это один из основных сигналов для Project Understanding / task-specific expertise.

## Research trajectory expansion

Research уходит глубже, чем требует текущий semantic decision, повторяет похожие вопросы или исследует информацию без подтверждённой потребности Worker.

Отдельные подвиды: semantic duplicate question, stale evidence, слишком широкий target-aware read.

## Planner over-decomposition

Один coherent пользовательский outcome разбивается на technical/file/layer steps, которые не имеют самостоятельного смысла успеха или failure.

## Planner under-decomposition

Независимые outcomes или реальные dependencies остаются одним step и создают слишком широкую execution boundary.

## Missing project knowledge

Для решения недостаточно текущих файлов/Research evidence, потому что важное project-specific правило, причина или пример не попадает в effective context.

Это не автоматически означает необходимость persistent Knowledge subsystem; сначала нужно понять повторяемость и источник нужной expertise.

## Stale knowledge/context

Cache или persistent observation формально существует, но больше не соответствует authoritative Project state.

## Validation-detectable invalid result

Edit технически применился, но результат нарушает проверяемое свойство: typecheck, tests, syntax/config parsing или другой deterministic invariant.

## Validation semantic/review failure

Результат может проходить deterministic checks, но нарушать requested scope, project policy или architecture consistency. Пока это research category: способ надёжной проверки не определён.

## Premature commit / state visibility

Изменение одного step уже записано на диск, хотя Task в целом ещё не завершена; последующие Worker/Research могут нуждаться в coherent virtual state или failure может потребовать task-wide rollback.

## Capability mismatch

Execution contract или выбранная стратегия не соответствует фактическим capabilities конкретной model/configuration. Один и тот же task profile может требовать разной степени runtime support.

## Human control required

Runtime встречает ambiguity, risk, conflict или решение, где корректнее запросить clarification/approval, чем продолжать автономно. Текущий interaction API для этого класса ещё не определён.

## Как использовать каталог

Для нового наблюдения сначала фиксируется конкретный пример и ближайший failure class. Если класс повторяется, можно решать, достаточно ли prompt/profile/context change или требуется новая runtime capability. Новая abstraction не считается автоматическим ответом на единичный failure.

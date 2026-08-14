# Архитектура 0.3

Nodus строится вокруг трёх верхних слоёв и нескольких явных границ. Это экспериментальная архитектура: abstractions сохраняются только пока подтверждаются реальными задачами и тестами.

## Верхние слои

- `app` — startup, composition, CLI и concrete logging;
- `engine` — task lifecycle, Planner, Determine, Worker, Research, Edit и Validation;
- `model` — граница с LLM/provider transport, response formats/schema и model capabilities.

`model` не зависит от `engine` или `app`. Provider transport не знает про task lifecycle, а Engine не знает OpenAI-compatible wire protocol.

## Runtime path

```text
App / CLI
  -> Engine.run(task)
  -> Planner -> Plan
  -> для каждого PlanStep:
       Determine -> Worker
       Worker -> bounded Actions / Research when needed
       Worker -> WorkerResult + semantic ProjectEditRequest
       Engine -> ProjectEditor -> prepare / recover / commit
       Engine -> Validation
       Engine -> следующий PlanStep
```

Worker владеет исполнением одного semantic step, но не физическим commit проекта. Engine не управляет внутренними Worker attempts и Research-вопросами, однако владеет границами, где результат Worker становится состоянием Project.

## Planner

Planner описывает outcomes и constraints, а не технические фазы. Разделение по файлам, слоям, Research или Validation само по себе не создаёт новый `PlanStep`. Цель — маленький coherent semantic plan.

## Worker и Actions

Worker — ограниченный execution process одного `PlanStep`. Actions — локальные capabilities с явными input/output contracts. Новая Action вводится только когда capability действительно повторяется как самостоятельная граница.

Code-changing flow возвращает semantic edit intent. Технические `range-replace`, `replace`, `diff` и full-file `edit` не являются Worker Actions.

## Edit ownership

Edit принадлежит Engine. Worker возвращает `ProjectEditRequest` с `path + instruction` и может указать preferred strategy. `ProjectEditor`:

1. получает authoritative source;
2. выбирает зарегистрированную `EditStrategy`;
3. готовит coherent edit set в памяти;
4. выполняет bounded technical recovery/fallback без rerun Worker;
5. проверяет canonical paths и stale-source guards;
6. начинает запись только после успешной подготовки всего набора;
7. при ошибке commit выполняет best-effort rollback.

Текущие стратегии: `range-replace`, exact `replace`, unified `diff`, full-file `edit`. Task-wide virtual workspace является отдельным research-направлением.

## Research

Research отвечает на bounded project question и владеет persistent cache/hash invalidation. Он не запускается превентивно. Worker запрашивает Research, когда execution требует конкретной недостающей информации.

## Validation

После успешного Worker/Edit результата Engine проходит отдельную Validation boundary. Сейчас `PassValidator` всегда возвращает `passed`: слой фиксирует lifecycle, но реальные validators ещё не выбраны. Typecheck, tests, config parsing, failure recovery и связь с будущим virtual workspace требуют отдельных сценариев.

## Project paths

Внутри engine используются canonical project-root-relative paths. Model-provided paths считаются untrusted input и проходят через `ProjectPathResolver`. Existing-file operations требуют существующий target; ambiguous repair запрещён. Protected/ignored paths учитываются write policy.

Разделение Nodus-owned internal storage (`.nodus`) и model-editable project paths остаётся отдельной архитектурной задачей.

## Language boundary

Конфиг различает `language.project`, `language.nodus` и `language.response`. Machine-facing language policy централизуется на model boundary; язык project-authored текста и user-facing response остаются отдельными concerns. Идентификаторы, пути и code symbols не переводятся.

## Interaction boundary

Engine является естественным control point между автономным Worker и пользователем. Approval, correction, interrupt, pause/resume и timeout semantics пока не являются завершённым runtime API.

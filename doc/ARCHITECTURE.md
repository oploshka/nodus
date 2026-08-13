# Architecture 0.3

Nodus строится вокруг трёх верхних слоёв и нескольких жёстких границ. Это экспериментальная архитектура: сохраняем только те abstractions, которые подтверждаются реальными задачами и тестами.

## Layers and dependencies

- `app` зависит от `engine` и `model`, собирает runtime и владеет process/CLI boundary;
- `engine` координирует task lifecycle и может использовать `model`;
- `model` не зависит от `engine` или `app`.

Provider transport не знает про task lifecycle. Engine не знает, как устроен OpenAI-compatible wire protocol.

## Runtime path

1. app вызывает `Engine.run(description)`;
2. Planner строит маленький semantic Plan;
3. Engine берёт следующий `PlanStep`;
4. Determine выбирает подходящий Worker из bounded options;
5. Worker получает полный контроль над выполнением одного step;
6. Worker выбирает/запускает доступные Actions;
7. primary Action сначала пытается выполнить задачу; если нужны конкретные project facts, он возвращает requests для `ResearchAction`;
8. Worker выполняет requested Research и повторяет primary Action с накопленным knowledge;
9. Worker возвращает Engine только `completed | not-completed | failed`;
10. только `completed` двигает global Plan дальше.

Engine не управляет внутренними attempts/actions и не должен понимать diff, cache или project APIs.

## Planner boundary

Planner описывает outcomes и constraints, а не реализацию. Декомпозиция разрешена только по semantic reasons (`coherent-outcome`, `independent-outcome`, `dependency`, `separate-deliverable`). Разные файлы, слои и technical phases не являются основанием для новых PlanStep.

## Worker / Action boundary

Worker — непредсказуемый процесс исполнения: задача может завершиться, остановиться по budget или стать terminal failure.

Action — более локальная capability с ясным contract. Action может использовать ModelCaller/ModelRunner, filesystem/project API и другие разрешённые зависимости. Prompt/guidance пока живёт рядом с Action, который понимает его смысл.

Текущий CodeWorker:

```text
CodeWorker
  ChangeCodeAction
  ResearchAction
```

## Research boundary

Research отвечает на один bounded project question. Он владеет cache lookup, source-hash invalidation и persistence. Research не является Worker и не запускается заранее «на всякий случай».

## Project path boundary

Project paths внутри engine canonical и relative to project root. Model-provided paths считаются untrusted input и проходят через `ProjectPathResolver`.

Read/edit existing operations требуют существующий file path; неверный prefix может быть исправлен только через однозначный index match. Writes учитывают protected/ignored paths.

`.nodus` сейчас временно исключён из write-policy enforcement, потому что Nodus-owned Research/index storage ещё использует общий `Project.write`. Это известный промежуточный компромисс; целевая архитектура разделит model-editable paths и internal runtime storage.

## Language boundary

Есть три разных языка: project, internal Nodus и user response. Конфиг уже разделяет их. Целевая граница: model layer автоматически добавляет internal language policy ко всем machine-facing calls, чтобы Actions/Services не дублировали это правило.

## Interaction boundary

Engine рассматривается как control plane между автономным Worker и внешним пользователем. Концептуально поддерживаются proposal/approval, correction, interrupt, pause/resume и timeout policies, но конкретный runtime API ещё не реализован.

## Validation

Validation намеренно отсутствует как отдельный слой. Worker `completed` пока означает только «Worker считает outcome достигнутым», а не формальное доказательство корректности всей пользовательской задачи.

## Владение изменениями Project

Edit целиком принадлежит Engine. Code-changing Worker/Action возвращает semantic `ProjectEditRequest` (`path + instruction + preferred strategy`), а authoritative source, edit serialization, applicator, buffering и atomic commit принадлежат `src/engine/Edit`.

`Engine` передаёт этот набор в `ProjectEditor`. Editor до первой записи проверяет все target paths и guards `expected`, затем коммитит набор целиком; при ошибке записи выполняется best-effort rollback. Это отделяет решение Worker «что должно измениться» от решения Engine «когда изменение становится состоянием проекта».

Текущая граница промежуточная: стратегии подготовки (`range-replace`, `diff`, full-file edit) пока остаются Worker Actions. Task-wide virtual workspace и commit только после завершения всего Plan не реализованы.


## Validation boundary

После успешного Worker результата и Engine-owned Edit commit выполняется отдельный Validation boundary. На текущем этапе `PassValidator` всегда возвращает success; реальные проверки намеренно отложены до появления конкретного validation contract. Подробности и TODO: [`../src/engine/Validation/VALIDATION.md`](../src/engine/Validation/VALIDATION.md).

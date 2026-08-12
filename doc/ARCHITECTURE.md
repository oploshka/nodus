# Nodus v0.3 — архитектура

## Верхний уровень

```text
Task → Planner
Planner ↔ Research
Planner → Execution
Execution → Artifact/Result → Planner
```

Это не три последовательных stage. У них разные ответственности.

## Planner

Planner владеет направлением задачи:

- интерпретирует Task;
- строит и меняет TaskPlan;
- следит за зависимостями и postconditions;
- определяет, какой WorkItem готов;
- решает, нужен ли Research;
- получает результат Execution и продолжает/replan/recovery.

Planner не должен знать алгоритм применения patch или внутренний retry конкретного исполнителя.

Текущий `PlanExecutor` всё ещё содержит часть старой orchestration-логики. В v0.3 это переходный компонент, который постепенно должен стать тоньше.

## Research

Research — память и уточнение знаний о проекте, а не второй Planner.

`ResearchStore` хранит два вида данных:

- загруженные project knowledge/policies;
- runtime cache конкретных `ResearchFact`.

Факт содержит value, sources и optional project revision/confidence. Факты можно инвалидировать по изменённому source-файлу.

Resolver-ы отвечают на запросы Planner к проекту. Они не выбирают следующую работу и не запускают бесконечный autonomous research-loop.

## Execution

Execution получает уже подготовленную работу и ограниченный набор входов.

Его минимальная модель:

```text
State → Option → Worker → State
```

### State

Держит фактическое состояние одной работы: inputs, proposal/candidate, attempt, lastError и history переходов.

### Option

Описывает допустимый следующий переход из текущего State. Option ничего не исполняет.

### Worker

Выполняет одну конкретную операцию. Worker может использовать модель, filesystem или CPU, но сам не меняет цель задачи.

## Первый pipeline: code change

`ChangeExecution` сейчас является первым полноценным execution runtime.

Опции и workers:

- `propose-change` → `EditProposalWorker`;
- `prepare-candidate` → `ChangePrepareWorker`;
- `validate-candidate` → `ChangeValidationWorker`;
- `commit-candidate` → `ChangeCommitWorker`.

`PatchApplyWorker` — отдельный CPU worker для применения unified diff к authoritative source.

Если prepare/validation отклоняет proposal, `ChangeExecution` возвращается в `ready` и повторяет proposal в пределах `maxAttempts`. Planner получает управление только после completed/failed или transport-level pause.

Это проводит границу:

- model proposal ≠ candidate;
- candidate ≠ validated result;
- validated result ≠ committed change.

## Model и Tool

Tools находятся в `src/model/Tool`, потому что для runtime это capabilities, которыми располагают model-backed workers/operations. Сам filesystem/git/terminal не является «интеллектом модели», но boundary выдачи и исполнения tools относится к model runtime.

## Project и Core

`project/` хранит представление проекта: `ProjectSession`, index, scanner, snapshot.

`core/` пока содержит общие runtime/domain сущности: Task, Conversation, Execution record, Configuration, Nodus и logging. Это ещё не окончательная структура; в частности logging позже может уйти в infrastructure.

## Переходные части

`operation/` пока сохранён. `OperationProfile` всё ещё смешивает model prompt/config, allowed transitions и execution policy. По мере развития State/Option/Worker часть этих данных должна перейти в Worker/Option configuration.

`agent/` теперь содержит только runtime/reporting/human interaction. Если эти ответственности окончательно разойдутся по новым слоям, папка `agent/` может исчезнуть.

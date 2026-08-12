# Nodus roadmap

- [x] `edit-file`: компактный `ACTION patch` с точными FIND/REPLACE вместо обязательной регенерации всего файла; full write оставлен fallback-ом.
- [x] Transport модели: конфигурируемый `model.requestTimeoutMs` и отдельные сообщения для timeout/connection/прочих transport errors.
- [ ] Model-test harness: зафиксировать concurrency=1 на уровне инфраструктуры, а не только структуры suite.
- [ ] Тестовые duration выводить в секундах с одной цифрой после запятой (`13.4 sec`).

New work is added at the top of **Current / next**. Completed or rejected items keep their status so architectural decisions do not have to be reconstructed from chat history.

Status: `[x]` done · `[ ]` planned/pending · `[-]` rejected/deferred design.

## Current / next

## v0.3.0 — Planner / Research / Execution

[x] Разделить верхний runtime на `planner/`, `research/`, `execution/`.
[x] Перенести model tools под `model/Tool`.
[x] Вынести первый реальный execution pipeline для `edit-file` как `State → Option → Worker`.
[x] Отделить proposal, candidate, validation и commit.
[x] Перенести patch applicator в CPU `PatchApplyWorker`.
[x] Добавить локальный execution retry: rejected candidate повторяется без возврата в общий Planner loop.
[x] Переименовать planner-local `ExecutionContext` в `PlannerContext`.
[x] Собрать project research memory в `ResearchStore` с fact cache и invalidation по source.
[ ] Вынести оставшийся search/understand orchestration из `PlanExecutor` к Research boundary.
[ ] Сформировать более простой Planner API поверх текущих `PlanGenerator/Compiler/Executor/Updater`.
[ ] Решить судьбу `operation/`: разделить profile между Option policy и Worker/model config либо удалить.
[ ] Добавить второй execution pipeline, чтобы проверить, что State/Option/Worker не заточен только под edit-file.

[ ] Replace the remaining legacy linear `PlanGenerator` fallback (`step-N.result`) with a requirement-compatible fallback or an explicit bounded planning failure.
[ ] Strengthen `exact` evidence qualification if lexical exact-tier matches prove too permissive, without reintroducing an LLM evaluator after every retrieval round.
[ ] Measure v0.3 live `/status` latency after deterministic prepare/finalize + RAW understand and optimize only the remaining expensive model stages.
[ ] Extend deterministic constraint validation beyond the first read-only/existing-state/no-side-effects mutating-call rules as new contract types appear.
[ ] Define a first-class verification contract/policy and decide when `verify` is inserted by default.
[ ] Continue migrating generic recovery toward requirement-based resolution where a typed missing contract exists.
[ ] Add ranked/truncated retrieval results (`totalFound`, `returned`, `topK`) for large projects.
[ ] Evaluate capability/model routing after the workflow is stable; include context-volume-based model selection.

## v0.2.0 — requirement-driven runtime

[x] Add explicit **capability-addition** child resolution: when grounded resolution concludes the required API/state access is absent, plan/apply one minimal supporting change and then recheck the original requirement.
[x] Add bounded child `RequirementResolutionPlanner` for one missing typed requirement.
[x] Recheck the original parent requirement after every child plan; a child execution or supporting edit alone is never success.
[x] Split deterministic retrieval outcomes into `exact | related | missing`.
[x] Prevent `related` evidence from satisfying an `evidence:*` postcondition.
[x] Add deterministic `prepare-change` fast path with model fallback.
[x] Add deterministic `finalize` fast path with model fallback.
[x] Add a deterministic constraint validator for read-only/existing-state/no-side-effects facts so scan/refresh-style access cannot satisfy those contracts.
[x] Preserve semantic requirement constraints such as `read-only`, `existing-state`, and `no-side-effects` through requirement map → plan → model context.
[x] Add `/status` evidence for read-only current-index access and prohibit scan/refresh as a valid status-read fact.
[x] Move `understand` from long JSON responses to the existing flat RAW `FIELD value` protocol.
[x] Keep deterministic search tool-call construction inside Nodus; model fallback may suggest lexical queries only.
[x] Separate typed workflow data kinds (`evidence`, `fact`, `change-definition`, `change-result`, ...).
[x] Build initial plans backward as `RequirementMap`, then deterministically compile them into `TaskPlan`.
[x] Document architecture, retrieval/resolution, response formats, and maintained testing strategy.
[x] Remove `doc/change` historical change manifests and stale abandoned-protocol tests.
[x] Mark package/runtime version as 0.2.0.

## Deferred / rejected for now

[-] Parallelize independent search requirements before the sequential runtime is stable and observable.
[-] Persist full raw source between workflow steps; keep source transient and facts compact instead.
[-] Add an LLM evaluator after every tool round; deterministic completion/postconditions are preferred.
[-] Let search models generate raw tool calls; Nodus owns tool selection and canonical tool schemas.
[-] Introduce a universal custom `<<<NODUS>>>` model protocol; use only `json | raw | text` with operation-specific parsers/schemas.

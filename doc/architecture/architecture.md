# Архитектура 0.5

Nodus строится вокруг трёх верхних слоёв и нескольких явных границ. Это экспериментальная архитектура: abstractions сохраняются только пока подтверждаются реальными задачами и тестами.

## Верхние слои

- `app` — startup, composition, CLI и concrete logging;
- `engine` — task lifecycle, Process runtime, Planner, Worker, Research, Edit и EngineTest;
- `model` — граница с LLM/provider transport, response formats/schema и model capabilities.

`model` не зависит от `engine` или `app`. Provider transport не знает про task lifecycle, а Engine не знает OpenAI-compatible wire protocol.

## Process 0.5

Версия 0.5 вводит schema-driven Process runtime как явный язык исполнения Core.

`ProcessRuntime` исполняет фиксированные `STEP`, локальные `SEQUENCE`, explicit context (`parent / previous / steps`) и controlled transition ещё не выполненного хвоста. Planner и Worker могут вернуть Core локальную schema через `MODULE_RESULT.SCHEMA`; Core сохраняет и исполняет её сам.

`automation/` является versioned executable configuration layer: там живут concrete Planner/Qualifier/Worker modules. `src/engine/Process/` хранит contracts и execution mechanics.

Production Engine lifecycle пока мигрирует на Process постепенно, поэтому старый task/PlanStep path остаётся compatibility boundary для Edit/EngineTest и части Worker execution.

## Текущий production path

```ts
Engine(task) {
  const edit = createEdit()

  for (step of plan) {
    const checkpoint = edit.state()
    const result = Worker.run(step, edit)

    if (result.failed) {
      edit.restore(checkpoint)
      break
    }
  }

  edit.apply()
  EngineTest.run()
}
```

Worker владеет исполнением одного semantic step, но не физическим apply проекта. Engine не управляет внутренними Worker attempts и Research-вопросами, однако владеет task-local Edit и границей применения накопленного состояния.

## Planner

Planner описывает outcomes и constraints, а не технические фазы. Разделение по файлам, слоям, Research, Edit validation или EngineTest само по себе не создаёт новый semantic step.

В Process path Planner может вернуть локальную schema; structural replan меняет только невыполненный хвост текущей sequence.

## Worker и Actions

Core Worker contract отделён от concrete automation Worker.

Process Worker выбирает один из двух implementation type:

- `SCHEMA` — локальная Process schema;
- `METHOD` — custom `run(request)`.

`WorkerSchema` и `WorkerMethod` задают эти два automation-facing base contract. `WorkerRunner` является adapter `STEP.WORKER -> Worker implementation`, а не base class concrete Worker.

Concrete `WorkerCode`, `WorkerDocumentation` и `WorkerAgent` находятся в `automation/Worker/`. Code/documentation пока используют Core `WorkerIterativeRunner` как compatibility execution mechanism; agent loop вынесен в generic `WorkerAgentRunner`.

Actions — локальные capabilities с явными input/output contracts. Новая Action вводится только когда capability действительно повторяется как самостоятельная граница.

Code-changing flow формирует semantic edit intent. Технические `range-replace`, `replace`, `diff` и full-file `edit` не являются Worker Actions.

Worker получает task-local Edit как execution tool. Это позволяет последующим Actions/steps читать уже накопленные изменения, не записанные на диск.

## Edit ownership

Edit принадлежит Engine и живёт в пределах одной Task. `ProjectEditor`:

1. читает сначала task-local content, затем Project;
2. materialize semantic intent через зарегистрированную `EditStrategy`;
3. готовит весь batch отдельно от накопленного state;
4. прогоняет batch через `EditValidator`;
5. только после успешной проверки добавляет batch в накопленное состояние;
6. поддерживает checkpoint/restore между semantic steps;
7. физически записывает выбранное состояние через `apply()`;
8. при ошибке записи выполняет best-effort rollback.

`JsonEditValidationCheck` сейчас выдаёт warning при strict JSON parse failure и не блокирует изменение.

## Research

Research отвечает на bounded project question и владеет persistent cache/hash invalidation. Он не запускается превентивно. Worker запрашивает Research, когда execution требует конкретной недостающей информации.

Research внутри `WorkerIterativeRunner` может читать task-local content через Edit. Cache/hash semantics пока остаются привязаны к физическому Project.

## EngineTest

После `Edit.apply()` Engine запускает project-level `EngineTest`.

- `ResolveEngineTest` — явный no-op success;
- `TypecheckEngineTest` — configured typecheck;
- `UnitEngineTest` — configured unit tests;
- `CompositeEngineTest` — несколько проверок последовательно.

Старый общий слой `Validation` больше не используется: prepared-change checks принадлежат `EditValidator`, а итоговые проверки Project — `EngineTest`.

## Project paths

Внутри engine используются canonical project-root-relative paths. Model-provided paths считаются untrusted input и проходят через `ProjectPathResolver`. Existing-file operations требуют существующий target; ambiguous repair запрещён. Protected/ignored paths учитываются write policy.

Разделение Nodus-owned internal storage (`.nodus`) и model-editable project paths остаётся отдельной архитектурной задачей.

## Language boundary

Конфиг различает `language.project`, `language.nodus` и `language.response`. Machine-facing language policy централизуется на model boundary; язык project-authored текста и user-facing response остаются отдельными concerns. Идентификаторы, пути и code symbols не переводятся.

## Interaction boundary

Engine остаётся естественным control point между автономным execution и пользователем. Partial apply, approval, correction, interrupt, pause/resume и timeout semantics пока не являются завершённым runtime API.

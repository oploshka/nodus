# Process Step

В Nodus 0.5 Process владеет общей механикой исполнения semantic steps, а `src/engine/Step/` хранит role-specific contracts.

## Process-owned primitive

Общий execution primitive живёт рядом с `ProcessRuntime`:

```text
src/engine/Process/Process/
  ProcessRuntime.ts
  ProcessSchema.ts
  ProcessTsType.ts
  ProcessStepSchema.ts
  ProcessStepMethod.ts
  ProcessStepTsType.ts
  ProcessStepRunner.ts
  ProcessStepResolver.ts
```

`ProcessStepSchema` и `ProcessStepMethod` задают два способа реализации: декларативная локальная schema или imperative method. `ProcessStepRunner` адаптирует конкретный `STEP` к `iProcessModule`, а `ProcessStepResolver` выполняет только deterministic lookup implementation id.

```text
semantic STEP
  -> role Runner
  -> ProcessStepRunner
  -> ProcessStepResolver
  -> implementation
       -> SCHEMA -> ProcessRuntime
       -> METHOD -> run(request)
```

## Semantic roles

`src/engine/Step/` не владеет общей Process mechanics. Здесь остаются различия ролей: input/result contract, capabilities и допустимая delegation.

```text
src/engine/Step/
  Worker/
  Planner/
  Qualifier/
  Action/
```

Каждая роль может иметь `Schema`, `Method`, typed contract и тонкий Runner. `QUALIFY` теперь имеет такой же явный role boundary, как `WORKER`, `PLAN` и `ACTION`.

Название каталога `Step/` остаётся рабочим: важно не имя папки, а то, что общий `ProcessStep*` принадлежит Process, а semantic role — отдельной extension surface.

## Action ownership

Core `Step/Action/` содержит только новый Process Action contract и `ActionRunner`. Concrete legacy Actions (`change-code`, `find-file`, `read-file`, `research`) являются executable automation behavior и живут в `automation/Action/`.

Старый `WorkerAction` contract остаётся только в legacy Worker boundary, потому что текущий production `WorkerIterativeRunner` ещё использует его. Он не является новым Process Action API.

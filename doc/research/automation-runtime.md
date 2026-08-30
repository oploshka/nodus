# Automation runtime

Статус: эксперимент.

Цель — проверить Nodus как runtime, который исполняет настраиваемые и версионируемые schemas, а не одну фиксированную цепочку `Planner -> Worker -> Edit -> Validation`.

Актуальный рабочий process contract описан в `doc/research/process-schema-v2.md`. Старый prototype с `kind/use/saveAs/variables` заменён локальной step-моделью.

## Разделение данных

`automation/` хранит пользовательские и версионируемые определения поведения Nodus: schemas, planner/worker presets, prompts и response contracts.

Служебные cache/log/state/session/index данные не должны жить в `automation/`; для них предназначен runtime storage `.nodus/`.

Чистые тексты prompts хранятся отдельно в Markdown. JavaScript связывает prompts, presets, schemas и transition-функции.

## Текущий prototype

Core contract использует:

```text
STEP.SEQUENCE
STEP.QUALIFY
STEP.PLAN
STEP.WORKER
STEP.ACTION
STEP.VALIDATE
STEP.REPLAN
```

Каждая `SEQUENCE` имеет локальную one-based нумерацию. Шаг получает только явно выбранный context:

```js
input: {
  context: {
    parent: true,
    previous: true,
    steps: [1, 2],
  },
}
```

После выполнения step может вызвать `transition(plan, step)`. В функцию передаётся только текущая локальная sequence; transition может переписать только хвост после выполненного шага.

Planner сам описан schema:

```text
QUALIFY
  ├─ SIMPLE  -> WORKER
  ├─ MULTI   -> PLAN -> nested SEQUENCE
  └─ PROCESS -> PLAN -> nested SEQUENCE
```

Planner планирует semantic tasks. Operational Actions остаются внутри Worker.

## Запуск prototype

Простой task:

```bash
npm run prototype:automation -- "Сформулировать один итоговый ответ"
```

Принудительно проверить multi-task route:

```bash
npm run prototype:automation -- --multi "Сравнить JSON, YAML и JavaScript как форматы конфигурации"
```

Проверить route для явно заданного процесса:

```bash
npm run prototype:automation -- --process "Исследовать варианты, сравнить их, затем выбрать итог"
```

Prototype использует локальные fake Planner/Worker modules: он проверяет schema mutation, qualifier routing, nested local numbering и context wiring без зависимости от реальной модели или test project.

Следующий этап — подключить model-backed `QUALIFY/PLAN`, затем отдельно реализовать `ACTION.ASK_USER` и Replan benchmarks на том же contract.

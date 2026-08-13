# Engine

`Engine.run()` координирует один task run. Он владеет исходным `Task`, global `Plan` и списком доступных Worker options.

Для каждого `PlanStep` Engine:

1. выбирает compatible Worker через `Determine`;
2. передаёт Worker управление step;
3. получает `WorkerResult`;
4. если Worker подготовил изменения, передаёт их engine-owned `ProjectEditor`;
5. только после успешного атомарного commit считает step завершённым;
6. реагирует на `completed / not-completed / failed`.

Engine не знает, какие Research вопросы задавал Worker, какие Actions выполнялись, сколько diff recovery было сделано и как устроен provider transport. При этом физическая мутация Project теперь принадлежит Engine через `ProjectEditor`: Worker может подготовить изменения, но не коммитит их сам.

## Services

`Planner`, `Research` и `Determine` рассматриваются как bounded services с конкретным ожидаемым результатом. Они могут использовать модель, но не владеют всем task lifecycle.

`Determine` выбирает один option из ограниченного набора. Сейчас Engine использует его для Worker routing, но сервис не должен быть Worker-specific.

`Research` отвечает на bounded project question и владеет cache/hash invalidation. Он не является Worker.

## Worker results

- `completed` — Worker считает PlanStep выполненным; Engine может перейти дальше;
- `not-completed` — текущая попытка закончилась, состояние/instance потенциально полезны для continuation;
- `failed` — execution path terminal.

Настоящий continuation API пока не реализован: текст `продолжить` сейчас был бы новой task, а не resume старого run.

## Execution samples

Engine пишет `engine.execution.sample`: task, PlanStep, candidates, selected Worker, result и duration. Это raw material для будущего task clustering, Worker success statistics и более дешёвого/стабильного Determine.

## Interaction / control points

Engine — естественная control boundary между автономным Worker и пользователем. Концепт уже зафиксирован, runtime API пока отложен.

Планируемая форма включает:

```ts
interface Interaction {
  id: string;
  type: 'change-approval' | 'question' | 'notification';
  message: string;
  tags?: string[];
  wait: InteractionWait;
}

type InteractionWait =
  | { mode: 'required' }
  | { mode: 'timeout'; timeoutMs: number; onTimeout: 'continue' | 'pause' | 'cancel' }
  | { mode: 'none' };
```

Нужны proposal approval/correction, async user interrupt и возможность timeout continuation для некритических состояний. Worker не должен владеть CLI/UI transport.


## Edit ownership

Edit теперь полностью находится на уровне Engine. Worker возвращает `ProjectEditRequest` с semantic `path + instruction`; `ProjectEditor` выбирает зарегистрированную `EditStrategy`, читает authoritative source, готовит все изменения в памяти и только затем атомарно коммитит набор.

`range-replace`, `replace`, `diff` и full-file `edit` больше не являются Worker Actions. Их model contracts и applicators живут в `src/engine/Edit`. Перед первой записью `ProjectEditor` проверяет canonical target path и соответствие buffered `expected` текущему содержимому. Ошибка подготовки не пишет ничего; ошибка записи после начала commit вызывает best-effort rollback.

Task-wide virtual workspace/commit после всех PlanSteps отдельно не реализован; это следующий независимый уровень ownership, а не часть текущего Editor.


## Validation

После успешного Worker/Edit результата Engine вызывает отдельный `Validator`. Сейчас `PassValidator` только закрепляет lifecycle boundary и всегда подтверждает результат; будущий контракт описан в [`Validation/VALIDATION.md`](Validation/VALIDATION.md).

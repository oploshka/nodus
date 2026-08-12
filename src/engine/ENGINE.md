# Engine

`Engine.run()` координирует один task run. Он владеет исходным `Task`, global `Plan` и списком доступных Worker options.

Для каждого `PlanStep` Engine:

1. выбирает compatible Worker через `Determine`;
2. передаёт Worker управление step;
3. получает только `WorkerResult`;
4. реагирует на `completed / not-completed / failed`.

Engine не знает, какие Research вопросы задавал Worker, какие Actions выполнялись, сколько diff recovery было сделано и как устроен provider transport.

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

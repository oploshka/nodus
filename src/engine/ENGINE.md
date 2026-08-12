# Engine

`Engine.run()` coordinates one task run. It owns the original `Task`, the global `Plan` and the list of available `Worker` options for that run.

For each `PlanStep`, Engine selects a compatible Worker and gives that Worker control of the step. Engine does not care how the Worker reaches its result; it reacts only to the returned `WorkerResult` status.

`Determine` is an atomic Engine service used to choose the best option from a bounded list. Engine currently uses it to choose between compatible Workers, but the service itself is not Worker-specific. A single available option is returned without a model call.

`Research` is an atomic Engine service, not a Worker type. A Worker may call Research while trying to complete its own task; the internal attempt/research/retry loop stays inside that Worker.

Only `completed` advances the global Plan. `not-completed` means the current Worker stopped with meaningful state and may be continued, reconsidered or replaced later. `failed` means the current execution path is terminal.

## Execution samples

Engine logs one structured `engine.execution.sample` event per Worker execution. It contains the original task, current PlanStep, candidate workers, selected worker, result and duration. The event is intentionally storage-agnostic for now; later it can feed task clustering, Worker success statistics and better Determine decisions.

Engine is also the natural control boundary between Worker execution and external/user interaction. A Worker owns local autonomy for one assigned task; Engine owns whether execution continues, changes Worker, pauses, or returns control outside.

## Interaction / control points

Interaction is currently a design contract rather than implemented runtime machinery. It describes points where execution may expose control to the user without making Worker responsible for UI or transport.

A Worker may surface a control point such as a proposed change, a question, or a condition that deserves user attention. Engine owns the lifecycle of that interaction and may route the response back to the same Worker. Interactions should have stable identifiers and may carry tags so a reply or approval can be associated with the relevant change, constraint, file, step, or other scope.

Conceptually:

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
  | {
      mode: 'timeout';
      timeoutMs: number;
      onTimeout: 'continue' | 'pause' | 'cancel';
    }
  | { mode: 'none' };
```

`required` means execution cannot safely continue without an actual answer. `timeout` gives the user a bounded opportunity to intervene and then performs an explicit fallback action. `none` is informational and does not block execution. These policies are expected to be configurable rather than hard-coded into Worker behavior.

A useful coding-agent case is a proposal checkpoint: Worker describes intended changes before applying them, Engine exposes that proposal to the user, and the user may approve it or return a correction. Silence may optionally mean continue after a configured timeout when the state is non-critical.

Interaction must also work in the opposite direction. A user should be able to interrupt an active run even when Worker did not request input, for example to add a constraint or correct the current direction. Engine should preserve the execution context and deliver that correction to the appropriate active Worker rather than treating the interruption as a new unrelated task.

The concrete pause/resume, timer and transport APIs are intentionally deferred until Worker execution is mature enough to show the minimal runtime contract they require.

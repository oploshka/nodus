import type { EngineModule } from './EngineModule.js';

export type tEngineDslDecision =
  | { type: 'run'; module: EngineModule; input?: unknown }
  | { type: 'end'; output?: unknown }
  | { type: 'fail'; reason: string };

/** Response-scoped DSL. It records one decision; EngineRuntime applies it. */
export class EngineDsl {
  private decision?: tEngineDslDecision;

  public run(module: EngineModule, input?: unknown): void {
    this.set({ type: 'run', module, input });
  }

  public end(output?: unknown): void {
    this.set({ type: 'end', output });
  }

  public fail(reason: string): void {
    this.set({ type: 'fail', reason });
  }

  public take(): tEngineDslDecision | undefined {
    const decision = this.decision;
    this.decision = undefined;
    return decision;
  }

  private set(decision: tEngineDslDecision): void {
    if (this.decision) throw new Error('Engine DSL response produced more than one decision.');
    this.decision = decision;
  }
}

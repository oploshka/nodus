import { enginePointNext, type sEnginePointNextDirective } from './EngineDirective.js';
import { EnginePoint, type sEnginePointConfig } from './EnginePoint.js';
import type { tEngineStepContext } from './EngineStepContext.js';
import type {
  iEngineStep,
  sEngineStepMetadata,
  tEngineRunDependencies,
} from './EngineStepInterface.js';

/** Shared Step schema contract. Leaf Steps may still execute directly through run(). */
export abstract class EngineStep implements iEngineStep {
  public abstract getId(): string | undefined;
  public abstract getGroup(): string;

  public getMetadata(): sEngineStepMetadata {
    const code = this.getId() ?? this.constructor.name;
    return { code, title: code, color: 'white' };
  }

  /** Creates mutable state owned by one concrete execution of this Step. */
  public createContext(_input: unknown): tEngineStepContext {
    return {};
  }

  protected point(config: sEnginePointConfig): EnginePoint {
    return new EnginePoint(config);
  }

  /** Describes the next Point without executing it. Runtime interprets the directive. */
  protected pointNext(point: EnginePoint, input?: unknown): sEnginePointNextDirective {
    return enginePointNext(point, input);
  }

  public abstract run(
    input: unknown,
    dependencies: tEngineRunDependencies,
    context: tEngineStepContext,
  ): Promise<unknown>;
}

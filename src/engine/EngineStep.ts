import { EnginePoint, type sEnginePointConfig } from './EnginePoint.js';
import type {
  iEngineStep,
  sEngineStepMetadata,
  tEngineRunDependencies,
} from './EngineStepInterface.js';

/** Shared Step contract. A composite Step starts by returning its first Point. */
export abstract class EngineStep implements iEngineStep {
  public abstract getId(): string | undefined;
  public abstract getGroup(): string;

  public getMetadata(): sEngineStepMetadata {
    const code = this.getId() ?? this.constructor.name;
    return { code, title: code, color: 'white' };
  }

  protected point(config: sEnginePointConfig): EnginePoint {
    return new EnginePoint(config);
  }

  public abstract run(
    input: unknown,
    dependencies: tEngineRunDependencies,
  ): unknown | Promise<unknown>;
}

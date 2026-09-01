import { EngineModule, type sEngineModuleConfig } from './EngineModule.js';
import type {
  iEngineStep,
  sEngineStepMetadata,
  tEngineRunDependencies,
} from './EngineStepInterface.js';

/** Shared Step contract. A Step may return a module to enter its local DSL flow. */
export abstract class EngineStep implements iEngineStep {
  public abstract getId(): string | undefined;
  public abstract getGroup(): string;

  public getMetadata(): sEngineStepMetadata {
    const code = this.getId() ?? this.constructor.name;
    return { code, title: code, color: 'white' };
  }

  protected module(config: sEngineModuleConfig): EngineModule {
    return new EngineModule(config);
  }

  public abstract run(
    input: unknown,
    dependencies: tEngineRunDependencies,
  ): unknown | Promise<unknown>;
}

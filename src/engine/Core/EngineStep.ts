import type { sEngineSchemaStep } from './EngineSchemaTsType.js';
import type {
  iEngineStep,
  sEngineStepMetadata,
  tEngineRunDependencies,
  tEngineStepRunResult,
} from './EngineStepInterface.js';

/** Shared executable Step contract. Concrete Steps implement identity, group and run(). */
export abstract class EngineStep implements iEngineStep {
  public abstract getId(): string | undefined;
  public abstract getGroup(): string;

  public getMetadata(): sEngineStepMetadata {
    const code = this.getId() ?? this.constructor.name;
    return { code, title: code, color: 'white' };
  }

  public getDependencies(): Readonly<Record<string, iEngineStep>> {
    return {};
  }

  public abstract run(
    step: sEngineSchemaStep,
    dependencies: tEngineRunDependencies,
  ): Promise<tEngineStepRunResult>;
}

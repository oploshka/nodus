import type {
  iEngineStep,
  sEngineStepRequest,
  tEngineRunDependencies,
  tEngineStepDefinition,
  tEngineStepRunResult,
} from './EngineStepInterface.js';

/** Shared executable Step contract. Concrete Steps implement identity, group and run(). */
export abstract class EngineStep implements iEngineStep {
  public abstract getId(): string | undefined;
  public abstract getGroup(): string;

  public getDependencies(): Readonly<Record<string, tEngineStepDefinition>> | undefined {
    return undefined;
  }

  public abstract run(
    request: sEngineStepRequest,
    dependencies: tEngineRunDependencies,
  ): tEngineStepRunResult | Promise<tEngineStepRunResult>;
}

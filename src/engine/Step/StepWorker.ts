import { EngineStep } from '@engine/Core/EngineStep.js';
import type { iEngineStep, sEngineStepMetadata } from '@engine/Core/EngineStepInterface.js';

export abstract class StepWorker extends EngineStep {
  private readonly dependencies: Readonly<Record<string, iEngineStep>>;

  protected constructor(dependencies: Readonly<Record<string, iEngineStep>> = {}) {
    super();
    this.dependencies = dependencies;
  }

  public getGroup(): string {
    return 'worker';
  }

  public getDependencies(): Readonly<Record<string, iEngineStep>> {
    return this.dependencies;
  }

  protected dependency(name: string): string {
    if (!this.dependencies[name]) {
      throw new Error(`Worker '${this.getId() ?? this.constructor.name}' does not declare dependency '${name}'.`);
    }

    const id = this.getId();
    if (!id) throw new Error('Worker dependency namespace requires a stable Worker id.');
    return `${id}::${name}`;
  }

  public getMetadata(): sEngineStepMetadata {
    return { ...super.getMetadata(), title: 'Worker', color: 'yellow' };
  }
}

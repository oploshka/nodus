import { EngineDsl } from './EngineDsl.js';
import { EngineModule } from './EngineModule.js';
import type { iEngineStep, tEngineRunDependencies } from './EngineStepInterface.js';

/** Minimal DSL-first runtime. Schema/history integration is intentionally absent for now. */
export class EngineRuntime {
  public async run(
    step: iEngineStep,
    input?: unknown,
    dependencies: tEngineRunDependencies = {},
  ): Promise<unknown> {
    return this.executeStep(step, input, dependencies);
  }

  private async executeStep(
    step: iEngineStep,
    input: unknown,
    dependencies: tEngineRunDependencies,
  ): Promise<unknown> {
    const result = await step.run(input, dependencies);
    if (result instanceof EngineModule) {
      return this.executeModule(result, input, dependencies);
    }
    return result;
  }

  private async executeModule(
    module: EngineModule,
    input: unknown,
    dependencies: tEngineRunDependencies,
  ): Promise<unknown> {
    const result = await this.executeStep(module.dependency, input, dependencies);
    if (!module.response) return result;

    const dsl = new EngineDsl();
    await module.response(result, dsl);
    const decision = dsl.take();
    if (!decision) return result;

    if (decision.type === 'run') {
      return this.executeModule(decision.module, decision.input, dependencies);
    }
    if (decision.type === 'end') return decision.output;

    throw new Error(decision.reason);
  }
}

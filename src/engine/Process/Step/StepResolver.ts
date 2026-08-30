import type { STEP } from '@engine/Process/ProcessSchema.js';
import type { iStepIdentity } from './Contract/StepTsType.js';

export interface iStepResolver {
  resolve<TStep extends iStepIdentity>(
    requestedId: string | undefined,
    steps: ReadonlyArray<TStep>,
    type: STEP,
  ): TStep;
}

/** Deterministic Step implementation selection. Semantic selection remains outside this resolver. */
export class StepResolver implements iStepResolver {
  public resolve<TStep extends iStepIdentity>(
    requestedId: string | undefined,
    steps: ReadonlyArray<TStep>,
    type: STEP,
  ): TStep {
    if (steps.length === 0) throw new Error(`StepResolver requires at least one ${type} implementation.`);

    const byId = new Map<string, TStep>();
    for (const step of steps) {
      if (step.type !== type) {
        throw new Error(`Step implementation '${step.getId()}' has type ${step.type}, expected ${type}.`);
      }
      const id = step.getId().trim();
      if (!id) throw new Error(`${type} Step id must be non-empty.`);
      if (byId.has(id)) throw new Error(`Duplicate ${type} Step id: ${id}`);
      byId.set(id, step);
    }

    const requested = requestedId?.trim();
    if (requested) {
      const step = byId.get(requested);
      if (!step) throw new Error(`Unknown ${type} Step implementation: ${requested}`);
      return step;
    }

    if (steps.length === 1) {
      const step = steps[0];
      if (!step) throw new Error(`StepResolver requires at least one ${type} implementation.`);
      return step;
    }

    throw new Error(`${type} Step requires an implementation id when several implementations are available.`);
  }
}

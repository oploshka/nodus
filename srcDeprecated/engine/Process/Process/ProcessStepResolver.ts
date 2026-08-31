import type { STEP } from './ProcessSchema.js';
import type { iProcessStepIdentity } from './ProcessStepTsType.js';

export interface iProcessStepResolver {
  resolve<TStep extends iProcessStepIdentity>(
    requestedId: string | undefined,
    steps: ReadonlyArray<TStep>,
    type: STEP,
  ): TStep;
}

/** Deterministic Process Step implementation selection. Semantic selection remains outside this resolver. */
export class ProcessStepResolver implements iProcessStepResolver {
  public resolve<TStep extends iProcessStepIdentity>(
    requestedId: string | undefined,
    steps: ReadonlyArray<TStep>,
    type: STEP,
  ): TStep {
    if (steps.length === 0) throw new Error(`ProcessStepResolver requires at least one ${type} implementation.`);

    const byId = new Map<string, TStep>();
    for (const step of steps) {
      if (step.type !== type) {
        throw new Error(`Process Step implementation '${step.getId()}' has type ${step.type}, expected ${type}.`);
      }
      const id = step.getId().trim();
      if (!id) throw new Error(`${type} Process Step id must be non-empty.`);
      if (byId.has(id)) throw new Error(`Duplicate ${type} Process Step id: ${id}`);
      byId.set(id, step);
    }

    const requested = requestedId?.trim();
    if (requested) {
      const step = byId.get(requested);
      if (!step) throw new Error(`Unknown ${type} Process Step implementation: ${requested}`);
      return step;
    }

    if (steps.length === 1) {
      const step = steps[0];
      if (!step) throw new Error(`ProcessStepResolver requires at least one ${type} implementation.`);
      return step;
    }

    throw new Error(`${type} Process Step requires an implementation id when several implementations are available.`);
  }
}

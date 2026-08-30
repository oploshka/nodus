import type { iPlannerModule } from './Contract/PlannerTsType.js';

export interface iPlannerResolver {
  resolve(preset: string | undefined, planners: ReadonlyArray<iPlannerModule>): iPlannerModule;
}

/** Deterministic Planner selection. Semantic selection remains outside this resolver. */
export class PlannerResolver implements iPlannerResolver {
  public resolve(preset: string | undefined, planners: ReadonlyArray<iPlannerModule>): iPlannerModule {
    if (planners.length === 0) throw new Error('PlannerResolver requires at least one Planner.');

    const byId = new Map<string, iPlannerModule>();
    for (const planner of planners) {
      const id = planner.getId().trim();
      if (!id) throw new Error('Planner id must be non-empty.');
      if (byId.has(id)) throw new Error(`Duplicate Planner id: ${id}`);
      byId.set(id, planner);
    }

    const requested = preset?.trim();
    if (requested) {
      const planner = byId.get(requested);
      if (!planner) throw new Error(`Unknown Planner preset: ${requested}`);
      return planner;
    }

    if (planners.length === 1) {
      const planner = planners[0];
      if (!planner) throw new Error('PlannerResolver requires at least one Planner.');
      return planner;
    }

    throw new Error('PLAN/REPLAN requires preset when several Planners are available.');
  }
}

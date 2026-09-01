import { describe, expect, it } from 'vitest';
import { PlannerResolver } from '@engine/Planner/PlannerResolver.js';
import type { iProcessPlanner } from '@engine/Planner/PlannerTsType.js';

const planner = (): iProcessPlanner => ({
  qualify: async () => 'SIMPLE',
  plan: async () => [],
  replan: async () => [],
});

describe('PlannerResolver', () => {
  it('returns the only configured planner', () => {
    const expected = planner();
    const resolver = new PlannerResolver();

    expect(resolver.resolve('task', [expected])).toBe(expected);
  });

  it('rejects missing planner configuration', () => {
    const resolver = new PlannerResolver();

    expect(() => resolver.resolve('task', [])).toThrow('requires one planner');
  });

  it('does not choose implicitly when several planners are configured', () => {
    const resolver = new PlannerResolver();

    expect(() => resolver.resolve('task', [planner(), planner()])).toThrow('cannot choose');
  });
});

// PolicyStore.ts

import type { Policy } from '@core/Policy/Policy';

export class PolicyStore {
  private readonly policies: Policy[] = [];

  add(policy: Policy): void {
    this.policies.push(policy);
  }

  getAll(): Policy[] {
    return [...this.policies];
  }
}
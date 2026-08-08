// Plan.ts

export interface PlanStep {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface Plan {
  steps: PlanStep[];
}
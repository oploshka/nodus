export interface PlanStep {
  id: string;
  goal: string;
  constraints: string[];
  knowledgeImpact?: string[];
}

export interface Plan {
  steps: PlanStep[];
}

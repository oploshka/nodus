import type { PlanStepType } from '@agent/Planning/TaskPlan';

export interface StepDefinition {
  type: PlanStepType;
  description: string;
  maxAttempts: number;
  initialPlanAllowed: boolean;
}

const DEFINITIONS: StepDefinition[] = [
  { type: 'search', description: 'Find relevant files, symbols, references, or project locations. Do not deeply analyze or modify files.', maxAttempts: 3, initialPlanAllowed: true },
  { type: 'understand', description: 'Read focused evidence and establish how the relevant code or project behavior works.', maxAttempts: 2, initialPlanAllowed: true },
  { type: 'prepare-change', description: 'Define the concrete intended changes and affected files. Do not generate final file contents.', maxAttempts: 1, initialPlanAllowed: true },
  { type: 'edit-file', description: 'Apply an already-defined change to concrete project files with minimal scope.', maxAttempts: 3, initialPlanAllowed: true },
  { type: 'review', description: 'Review applied changes for correctness, scope, and consistency with the task.', maxAttempts: 1, initialPlanAllowed: true },
  { type: 'verify', description: 'Run focused deterministic checks when useful.', maxAttempts: 1, initialPlanAllowed: true },
  { type: 'finalize', description: 'Produce the user-facing result. Do not modify the project.', maxAttempts: 1, initialPlanAllowed: true },
];

export class StepRegistry {
  private readonly definitions = new Map<PlanStepType, StepDefinition>(DEFINITIONS.map((definition) => [definition.type, definition]));

  public get(type: PlanStepType): StepDefinition {
    const definition = this.definitions.get(type);
    if (!definition) throw new Error(`Unknown plan step type: ${type}`);
    return definition;
  }

  public has(value: string): value is PlanStepType {
    return this.definitions.has(value as PlanStepType);
  }

  public listForPlanner(): StepDefinition[] {
    return Array.from(this.definitions.values()).filter((definition) => definition.initialPlanAllowed);
  }

  public limit(type: PlanStepType): number {
    return this.get(type).maxAttempts;
  }
}

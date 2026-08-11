export interface Attempt {
  number: number;
  startedAt: number;
  finishedAt?: number;
  error?: string;
}

export interface Step {
  id: string;
  stageId: string;
  operationId: string;
  attempts: Attempt[];
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  steps: Step[];
}

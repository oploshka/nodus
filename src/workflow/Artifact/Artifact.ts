export interface Artifact<T = unknown> {
  key: string;
  value: T;
  producer?: {
    stageId?: string;
    operationId?: string;
    stepId?: string;
  };
}

import type { ArtifactStore } from '../Artifact/ArtifactStore';

export type OperationExecutorKind = 'cpu' | 'model' | 'tool';

export interface OperationDefinition {
  id: string;
  executor: OperationExecutorKind;
  inputs?: string[];
  outputs?: string[];
}

export interface OperationContext {
  artifacts: ArtifactStore;
  stageId: string;
  stepId: string;
}

export interface Operation {
  readonly definition: OperationDefinition;
  execute(context: OperationContext): Promise<void>;
}

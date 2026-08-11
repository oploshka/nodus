export interface StageDefinition {
  id: string;
  inputs?: string[];
  outputs?: string[];
}

export interface Stage {
  readonly definition: StageDefinition;
  selectOperation(availableArtifacts: ReadonlySet<string>): string | undefined;
}

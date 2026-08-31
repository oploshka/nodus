import type { ModelRunSettings } from '@model/Request/ModelRun.js';

export type EditStrategyId = 'range-replace' | 'replace' | 'diff' | 'edit';

/** Semantic edit intent produced by Worker. It contains no model-specific edit serialization. */
export interface ProjectEditIntent {
  path: string;
  instruction: string;
}

/** Engine-facing request to prepare and commit one coherent edit set. */
export interface ProjectEditRequest {
  strategy: EditStrategyId;
  edits: ProjectEditIntent[];
  settings?: ModelRunSettings;
}

export interface EditPreparationContext {
  task: { description: string };
  step: unknown;
  edit: ProjectEditIntent;
  source: string;
  settings?: ModelRunSettings;
}

export interface PreparedProjectChange {
  path: string;
  expected: string;
  content: string;
  strategy: EditStrategyId;
}

export type EditPrepareResult =
  | { status: 'completed'; path: string; content: string; operations?: number }
  | { status: 'not-completed'; reason: string };

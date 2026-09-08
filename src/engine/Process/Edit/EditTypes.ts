import type { tEngineEmit } from '@engine/EngineEvent.js';
import type { ModelRunSettings } from '@model/Request/ModelRun.js';

export type EditStrategyId = 'range-replace' | 'replace' | 'diff' | 'edit';

/** Semantic update intent for an existing project file. */
export interface ProjectEditIntent {
  path: string;
  instruction: string;
}

/** Semantic file operation produced by Worker. */
export type ProjectFileChange =
  | {
      type: 'update';
      path: string;
      instruction: string;
    }
  | {
      type: 'create';
      path: string;
      instruction: string;
    };

/** Engine-facing request to prepare and commit one coherent file-change set. */
export interface ProjectEditRequest {
  strategy: EditStrategyId;
  changes?: ProjectFileChange[];
  /** @deprecated Compatibility input; interpreted as update changes. */
  edits?: ProjectEditIntent[];
  settings?: ModelRunSettings;
}

export interface EditPreparationContext {
  task: { description: string };
  step: unknown;
  edit: ProjectFileChange;
  source: string;
  emit: tEngineEmit;
  settings?: ModelRunSettings;
}

export type PreparedProjectChange =
  | {
      type: 'update';
      path: string;
      expected: string;
      content: string;
      strategy: EditStrategyId;
    }
  | {
      type: 'create';
      path: string;
      content: string;
      strategy: EditStrategyId;
    };

export type EditPrepareResult =
  | { status: 'completed'; path: string; content: string; operations?: number }
  | { status: 'not-completed'; reason: string };

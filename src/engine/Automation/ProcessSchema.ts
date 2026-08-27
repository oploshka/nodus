export type pProcessStatus = 'completed' | 'failed';

export interface sProcessNodeRef {
  id: string;
  kind: 'sequence' | 'action';
}

export interface sProcessAction {
  kind: 'action';
  id: string;
  /** Core module id, for example worker, validate or replan. */
  use: string;
  /** Optional module preset from the automation package. */
  preset?: string;
  /** Module input field -> process variable reference. */
  input?: Record<string, string>;
  /** Save the full module result into this process variable. */
  saveAs?: string;
  /** Recovery chain executed only when this action fails. */
  onFailure?: sProcessNode[];
}

export interface sProcessSequence {
  kind: 'sequence';
  id: string;
  /** Variables owned by this sequence scope. */
  variables?: string[];
  /** Child variable -> parent variable reference. */
  input?: Record<string, string>;
  /** Parent variable -> child variable reference. */
  output?: Record<string, string>;
  steps: sProcessNode[];
}

export type sProcessNode = sProcessAction | sProcessSequence;
export type sProcessSchema = sProcessSequence;

export interface sProcessModuleResult {
  status: pProcessStatus;
  value?: unknown;
  reason?: string;
  /** Optional process produced dynamically by this module, for example Replan. */
  process?: sProcessSequence;
}

export interface sProcessExecutionContext {
  node: sProcessNodeRef;
  parent?: sProcessNodeRef;
  preset?: string;
}

export interface iProcessModule {
  readonly id: string;
  execute(input: Readonly<Record<string, unknown>>, context: sProcessExecutionContext): Promise<sProcessModuleResult>;
}

export interface sProcessTraceEntry {
  node: sProcessNodeRef;
  parent?: sProcessNodeRef;
  module?: string;
  status: 'started' | pProcessStatus;
}

export interface sProcessRunResult {
  status: pProcessStatus;
  variables: Readonly<Record<string, unknown>>;
  trace: ReadonlyArray<sProcessTraceEntry>;
  reason?: string;
}

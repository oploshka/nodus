// RequirementMap.ts
import type { WorkflowDataRef } from '@agent/Planning/WorkflowData';

export type EvidenceKind = 'file' | 'symbol' | 'definition' | 'usage' | 'reference' | 'example';

export interface RequirementEntry {
  ref: WorkflowDataRef;
  description: string;
  requires: WorkflowDataRef[];
  evidenceKind?: EvidenceKind;
  sourceHints?: string[];
  targetPath?: string;
}

export interface RequirementMap {
  version: 1;
  goal: string;
  root: WorkflowDataRef;
  entries: RequirementEntry[];
}

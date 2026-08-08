// KnowledgeEntry.ts
export type KnowledgeType = 'understanding' | 'pattern' | 'decision' | 'policy';
export type KnowledgeScope = 'global' | 'project' | 'area' | 'directory' | 'file';
export type KnowledgeStatus = 'active' | 'stale' | 'disputed' | 'draft';
export type KnowledgeSource = 'parser' | 'code' | 'model' | 'human' | 'docs';

export interface KnowledgeEntry {
  id: string;
  type: KnowledgeType;
  content: string;
  scope: KnowledgeScope;
  scopeValue?: string;
  appliesTo: string[];
  priority: number;
  source: KnowledgeSource;
  confidence: number;
  status: KnowledgeStatus;
  relatedIds: string[];
  relatedFiles: string[];
  createdAt?: string;
  updatedAt?: string;
}

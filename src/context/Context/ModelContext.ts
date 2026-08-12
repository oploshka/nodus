// ModelContext.ts
import type { ConversationEntry } from '@core/Conversation/Conversation';
import type { ExecutionEvent, ToolContextEntry } from '@core/Execution/Execution';
import type { KnowledgeEntry } from '@research/Entry/KnowledgeEntry';

export interface ModelContext {
  conversation: ConversationEntry[];
  executionHistory: ExecutionEvent[];
  toolContext: ToolContextEntry[];
  policies: KnowledgeEntry[];
  knowledge: KnowledgeEntry[];
  project: {
    projectId: string;
    root: string;
    indexedFiles: string[];
    hasIndex: boolean;
  };
}

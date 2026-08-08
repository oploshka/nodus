// ModelContext.ts
import type { ConversationEntry } from '@core/Conversation/Conversation';
import type { ExecutionEvent } from '@core/Execution/Execution';
import type { KnowledgeEntry } from '@knowledge/Entry/KnowledgeEntry';

export interface ModelContext {
  conversation: ConversationEntry[];
  executionHistory: ExecutionEvent[];
  policies: KnowledgeEntry[];
  knowledge: KnowledgeEntry[];
  project: {
    projectId: string;
    root: string;
    indexedFiles: string[];
    hasIndex: boolean;
  };
}

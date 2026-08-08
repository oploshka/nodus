// ContextSelector.ts
import type { Conversation } from '@core/Conversation/Conversation';
import type { Execution } from '@core/Execution/Execution';
import type { Task } from '@core/Task/Task';
import type { ModelContext } from '@context/Context/ModelContext';
import type { KnowledgeResolver } from '@knowledge/Resolver/KnowledgeResolver';
import type { OperationProfile } from '@operation/Profile/OperationProfile';
import type { ProjectSession } from '@project/ProjectSession/ProjectSession';

export class ContextSelector {
  public constructor(private readonly knowledgeResolver: KnowledgeResolver) {}

  public select(
    task: Task,
    execution: Execution,
    conversation: Conversation,
    projectSession: ProjectSession,
    operation: OperationProfile,
  ): ModelContext {
    const resolved = this.knowledgeResolver.resolve(task, operation);
    const indexedFiles = this.selectIndexedFiles(task.description, projectSession, 120);

    return {
      conversation: conversation.recent(6),
      executionHistory: execution.history.slice(-16),
      toolContext: execution.getToolContext(),
      policies: resolved.policies,
      knowledge: resolved.knowledge,
      project: {
        projectId: projectSession.projectId,
        root: projectSession.root,
        indexedFiles,
        hasIndex: Boolean(projectSession.index),
      },
    };
  }

  private selectIndexedFiles(description: string, projectSession: ProjectSession, limit: number): string[] {
    const files = projectSession.index?.files ?? [];
    if (files.length <= limit) {
      return files.map((file) => file.path);
    }

    const terms = description
      .toLowerCase()
      .split(/[^a-zа-яё0-9_$-]+/iu)
      .filter((term) => term.length >= 3);

    return files
      .map((file) => ({
        path: file.path,
        score: terms.reduce((score, term) => score + (file.path.toLowerCase().includes(term) ? 1 : 0), 0),
      }))
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
      .slice(0, limit)
      .map((item) => item.path);
  }
}

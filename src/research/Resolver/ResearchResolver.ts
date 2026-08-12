import type { Task } from '@core/Task/Task';
import type { KnowledgeEntry } from '@research/Entry/KnowledgeEntry';
import type { ResearchFact } from '@research/Fact/ResearchFact';
import type { ResearchStore } from '@research/Store/ResearchStore';
import type { OperationProfile } from '@operation/Profile/OperationProfile';

export interface ResolvedResearchContext {
  policies: KnowledgeEntry[];
  knowledge: KnowledgeEntry[];
}

export class ResearchResolver {
  public constructor(private readonly store: ResearchStore) {}

  public getFact(key: string): ResearchFact | undefined {
    return this.store.getFact(key);
  }

  public rememberFact(fact: Omit<ResearchFact, 'createdAt'> & { createdAt?: string }): ResearchFact {
    return this.store.putFact(fact);
  }

  public invalidateSource(source: string): string[] {
    return this.store.invalidateBySource(source);
  }

  public resolve(task: Task, operation: OperationProfile, limit: number = 12): ResolvedResearchContext {
    const active = this.store.all().filter((entry) => entry.status === 'active');
    const terms = this.tokens(`${task.description} ${operation.id} ${operation.execution.policyScopes.join(' ')}`);

    const policies = active
      .filter((entry) => entry.type === 'policy')
      .filter((entry) => this.matchesPolicyScope(entry, operation.execution.policyScopes))
      .sort((a, b) => this.score(b, terms) - this.score(a, terms))
      .slice(0, limit);

    const knowledge = active
      .filter((entry) => entry.type !== 'policy')
      .sort((a, b) => this.score(b, terms) - this.score(a, terms))
      .slice(0, limit);

    return { policies, knowledge };
  }

  private matchesPolicyScope(entry: KnowledgeEntry, scopes: string[]): boolean {
    if (entry.appliesTo.length === 0 || scopes.length === 0) return true;
    return entry.appliesTo.some((tag) => scopes.includes(tag) || scopes.includes('*'));
  }

  private score(entry: KnowledgeEntry, terms: Set<string>): number {
    const haystack = `${entry.content} ${entry.appliesTo.join(' ')} ${entry.relatedFiles.join(' ')}`.toLowerCase();
    let score = entry.priority + entry.confidence * 10;
    for (const term of terms) if (haystack.includes(term)) score += 5;
    if (entry.scope === 'file') score += 5;
    if (entry.scope === 'directory') score += 4;
    if (entry.scope === 'area') score += 3;
    if (entry.scope === 'project') score += 2;
    if (entry.scope === 'global') score += 1;
    return score;
  }

  private tokens(value: string): Set<string> {
    return new Set(value.toLowerCase().split(/[^a-zа-яё0-9_$-]+/iu).filter((term) => term.length >= 3));
  }
}

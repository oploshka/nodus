export interface ProjectKnowledgeWikiEntry {
  topic: string;
  summary: string;
  sources: string[];
}

/** Stable descriptive knowledge about what parts of the project are and how they relate. */
export class ProjectKnowledgeWiki {
  private readonly values = new Map<string, ProjectKnowledgeWikiEntry>();

  public get(topic: string): ProjectKnowledgeWikiEntry | undefined { return this.values.get(topic); }
  public set(entry: ProjectKnowledgeWikiEntry): void { this.values.set(entry.topic, entry); }
  public entries(): ProjectKnowledgeWikiEntry[] { return [...this.values.values()]; }
}

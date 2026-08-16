export interface ProjectKnowledgeStandardEntry {
  key: string;
  rule: string;
  sources: string[];
}

/** Normative project knowledge about how new implementation should normally be written. */
export class ProjectKnowledgeStandard {
  private readonly values = new Map<string, ProjectKnowledgeStandardEntry>();

  public get(key: string): ProjectKnowledgeStandardEntry | undefined { return this.values.get(key); }
  public set(entry: ProjectKnowledgeStandardEntry): void { this.values.set(entry.key, entry); }
  public entries(): ProjectKnowledgeStandardEntry[] { return [...this.values.values()]; }
}

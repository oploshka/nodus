export interface ProjectWikiEntry {
  topic: string;
  summary: string;
  sources: string[];
}

/** Stable descriptive knowledge about what parts of the project are and how they relate. */
export class ProjectWiki {
  private readonly values = new Map<string, ProjectWikiEntry>();

  public get(topic: string): ProjectWikiEntry | undefined { return this.values.get(topic); }
  public set(entry: ProjectWikiEntry): void { this.values.set(entry.topic, entry); }
  public entries(): ProjectWikiEntry[] { return [...this.values.values()]; }
}

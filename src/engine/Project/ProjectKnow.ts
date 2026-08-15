export interface ProjectKnowEntry {
  key: string;
  value: string;
  sources: string[];
}

/** Temporary generic project-knowledge zone for facts that do not yet have a clearer owner. */
export class ProjectKnow {
  private readonly values = new Map<string, ProjectKnowEntry>();

  public get(key: string): ProjectKnowEntry | undefined { return this.values.get(key); }
  public set(entry: ProjectKnowEntry): void { this.values.set(entry.key, entry); }
  public entries(): ProjectKnowEntry[] { return [...this.values.values()]; }
}

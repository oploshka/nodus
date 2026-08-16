export interface ProjectStandardEntry {
  key: string;
  rule: string;
  sources: string[];
}

/** Project-specific rules and conventions for how implementation should be written. */
export class ProjectStandard {
  private readonly values = new Map<string, ProjectStandardEntry>();

  public get(key: string): ProjectStandardEntry | undefined { return this.values.get(key); }
  public set(entry: ProjectStandardEntry): void { this.values.set(entry.key, entry); }
  public entries(): ProjectStandardEntry[] { return [...this.values.values()]; }
}

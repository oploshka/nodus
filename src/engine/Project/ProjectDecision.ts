export interface ProjectDecisionEntry {
  key: string;
  decision: string;
  reason?: string;
  sources: string[];
}

/** Explicit project decisions, including the reason when it is known. */
export class ProjectDecision {
  private readonly values = new Map<string, ProjectDecisionEntry>();

  public get(key: string): ProjectDecisionEntry | undefined { return this.values.get(key); }
  public set(entry: ProjectDecisionEntry): void { this.values.set(entry.key, entry); }
  public entries(): ProjectDecisionEntry[] { return [...this.values.values()]; }
}

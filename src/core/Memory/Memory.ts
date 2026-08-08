// Memory.ts

export interface Memory {
  plannedSteps: unknown[];
  completedSteps: unknown[];
  lastFilesModified: string[];
  triedFixes: string[];
  data: Record<string, unknown>;
}
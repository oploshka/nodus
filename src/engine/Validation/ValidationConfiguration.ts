export interface ValidationCommandConfiguration {
  id: string;
  command: string;
  timeoutMs?: number;
  /** `changes` skips the command for completed steps that did not edit project files. */
  when?: 'always' | 'changes';
}

export interface ValidationConfiguration {
  /** Parse changed .json files after Edit commit. Enabled by default. */
  json?: boolean;
  /** Trusted project commands configured by the user, for example typecheck or tests. */
  commands?: ValidationCommandConfiguration[];
}

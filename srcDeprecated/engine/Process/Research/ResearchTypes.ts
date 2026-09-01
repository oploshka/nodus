import type { ModelRunSettings } from '@model/Request/ModelRun.js';

export interface ResearchSource {
  path: string;
  hash: string;
}

export interface ResearchAnswer {
  question: string;
  status: 'resolved' | 'not-found';
  answer: string;
  sources: ResearchSource[];
  createdAt: string;
}

export interface ResolvedResearch {
  status: 'resolved' | 'not-found';
  answer: string;
  sources: string[];
  reason?: string;
}

export interface ResearchResolveOptions {
  guidance?: string;
  settings?: ModelRunSettings;
  /** Optional task-local file reader. Cache/hash semantics remain Project-based for now. */
  readFile?: (path: string) => Promise<string>;
}

export interface ResearchResolver {
  resolve(question: string, options?: ResearchResolveOptions): Promise<ResolvedResearch>;
}

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
}

export interface ResearchResolver {
  resolve(question: string, options?: ResearchResolveOptions): Promise<ResolvedResearch>;
}

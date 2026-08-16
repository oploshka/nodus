import type { ResearchAnswer } from '@engine/Research/ResearchTypes.js';

export interface sWorkerSearchContext {
  kind: 'search';
  query: string;
  paths: string[];
}

export interface sWorkerReadContext {
  kind: 'read';
  path: string;
  content: string;
}

export interface sWorkerResearchContext {
  kind: 'research';
  value: ResearchAnswer;
}

export type tWorkerContextItem = sWorkerSearchContext | sWorkerReadContext | sWorkerResearchContext;

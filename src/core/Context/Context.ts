import type { Knowledge } from '@knowledge/Knowledge';

export interface Context {
  task: string;
  knowledge?: Knowledge;
  files: string[];
}
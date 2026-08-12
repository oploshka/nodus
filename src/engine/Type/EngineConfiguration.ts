export interface ProjectConfiguration {
  id: string;
  root: string;
  scanMode?: 'manual' | 'on-open';
  include?: string[];
  exclude?: string[];
  indexCachePath?: string;
  researchCachePath?: string;
}

export interface WorkerConfiguration {
  maxWorkerIterations?: number;
  maxResearchActions?: number;
  maxEditActions?: number;
}

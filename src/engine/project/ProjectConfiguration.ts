export interface ProjectConfiguration {
  id: string;
  root: string;
  scanMode?: 'manual' | 'on-open';
  include?: string[];
  exclude?: string[];
  indexCachePath?: string;
  researchCachePath?: string;
}

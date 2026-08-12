export interface ResearchFact {
  key: string;
  value: string;
  sources: string[];
  confidence?: number;
  projectRevision?: string;
  createdAt: string;
}

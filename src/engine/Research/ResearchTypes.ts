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

export interface ResearchResolver {
  resolve(question: string): Promise<ResolvedResearch>;
}

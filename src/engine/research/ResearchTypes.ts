export interface ResearchSource {
  path: string;
  hash: string;
}

export interface ResearchAnswer {
  question: string;
  answer: string;
  sources: ResearchSource[];
  createdAt: string;
}

export interface ResolvedResearch {
  answer: string;
  sources: string[];
}

export interface ResearchResolver {
  resolve(question: string): Promise<ResolvedResearch>;
}

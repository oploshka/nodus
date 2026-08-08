// Configuration.ts

export interface Configuration {
  projectRoot: string;
  model: {
    provider: string;
    model: string;
    apiKey?: string;
  };
  agent: {
    maxSteps: number;
  };
}
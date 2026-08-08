// Response.ts

export interface ModelResponse {
  type: 'message' | 'tool';
  content?: string;
  tool?: {
    name: string;
    input: unknown;
  };
}
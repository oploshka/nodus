// OperationProfile.ts
export interface OperationProfile {
  id: string;
  description: string;
  promptId: string;
  contextStrategy: string;
  policyScopes: string[];
  outputSchema?: string;
  fallback?: string;
  allowedTransitions?: string[];
  costWeight?: number;
  enabled: boolean;
}

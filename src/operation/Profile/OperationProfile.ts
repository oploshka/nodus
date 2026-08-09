// OperationProfile.ts
import type { ModelCallProfile } from '@model/Profile/ModelCallProfile';

export interface OperationExecutionSettings {
  contextStrategy: string;
  policyScopes: string[];
  fallback?: string;
  allowedTransitions?: string[];
  costWeight?: number;
}

export interface OperationProfile extends ModelCallProfile {
  id: string;
  description: string;
  execution: OperationExecutionSettings;
  enabled: boolean;
}

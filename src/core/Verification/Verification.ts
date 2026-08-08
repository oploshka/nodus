import type { Task } from '@core/Task/Task';
import type { VerificationResult } from '@core/Verification/VerificationResult';

export interface Verification {
  verify(task: Task): Promise<VerificationResult>;
}
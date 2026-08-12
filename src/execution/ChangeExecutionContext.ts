import type { Conversation } from '@core/Conversation/Conversation';
import type { Execution } from '@core/Execution/Execution';
import type { LogContext } from '@core/Logging/Log';
import type { Task } from '@core/Task/Task';
import type { StepEvidenceItem } from '@model/Result/OperationResult';

export interface ChangeExecutionContext {
  task: Task;
  conversation: Conversation;
  execution: Execution;
  logContext: LogContext;
  activeEvidence: {
    findings: string[];
    evidence: StepEvidenceItem[];
    missing: string[];
  };
}

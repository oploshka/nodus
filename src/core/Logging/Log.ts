// Log.ts
import type { LogLevel } from '@core/Configuration/Configuration';

export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  event: string;
  projectId?: string;
  conversationId?: string;
  taskId?: string;
  executionId?: string;
  data?: unknown;
}

export interface LogContext {
  projectId?: string;
  conversationId?: string;
  taskId?: string;
  executionId?: string;
}

export interface LogSink {
  write(record: LogRecord): Promise<void> | void;
}

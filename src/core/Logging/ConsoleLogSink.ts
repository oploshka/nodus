// ConsoleLogSink.ts
import type { LogRecord, LogSink } from '@core/Logging/Log';

export class ConsoleLogSink implements LogSink {
  public write(record: LogRecord): void {
    const ids = [
      record.projectId && `project=${record.projectId}`,
      record.conversationId && `conversation=${record.conversationId}`,
      record.taskId && `task=${record.taskId}`,
      record.executionId && `execution=${record.executionId}`,
    ].filter(Boolean).join(' ');

    const suffix = record.data === undefined ? '' : ` ${this.formatData(record.data)}`;
    console.log(`[${record.timestamp}] ${record.level.toUpperCase()} ${record.event}${ids ? ` ${ids}` : ''}${suffix}`);
  }

  private formatData(data: unknown): string {
    if (typeof data === 'string') {
      return data;
    }

    try {
      return JSON.stringify(data);
    } catch {
      return String(data);
    }
  }
}

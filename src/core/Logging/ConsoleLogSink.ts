// ConsoleLogSink.ts
import type { LogLevel } from '@core/Configuration/Configuration';
import type { LogRecord, LogSink } from '@core/Logging/Log';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class ConsoleLogSink implements LogSink {
  public constructor(private readonly minimumLevel: LogLevel = 'error') {}

  public write(record: LogRecord): void {
    if (LEVEL_WEIGHT[record.level] < LEVEL_WEIGHT[this.minimumLevel]) return;
    const suffix = record.data === undefined ? '' : ` ${this.formatData(record.data)}`;
    console.error(`[${record.timestamp}] ${record.level.toUpperCase()} ${record.event}${suffix}`);
  }

  private formatData(data: unknown): string {
    if (typeof data === 'string') return data;
    try { return JSON.stringify(data); } catch { return String(data); }
  }
}

// Logger.ts
import type { LogLevel } from '@core/Configuration/Configuration';
import type { LogContext, LogRecord, LogSink } from '@core/Logging/Log';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class Logger {
  public constructor(
    private readonly level: LogLevel,
    private readonly sinks: LogSink[],
  ) {}

  public async debug(event: string, data?: unknown, context: LogContext = {}): Promise<void> {
    await this.log('debug', event, data, context);
  }

  public async info(event: string, data?: unknown, context: LogContext = {}): Promise<void> {
    await this.log('info', event, data, context);
  }

  public async warn(event: string, data?: unknown, context: LogContext = {}): Promise<void> {
    await this.log('warn', event, data, context);
  }

  public async error(event: string, data?: unknown, context: LogContext = {}): Promise<void> {
    await this.log('error', event, data, context);
  }

  private async log(level: LogLevel, event: string, data: unknown, context: LogContext): Promise<void> {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.level]) {
      return;
    }

    const record: LogRecord = {
      timestamp: new Date().toISOString(),
      level,
      event,
      ...context,
      data,
    };

    await Promise.all(this.sinks.map(async (sink) => sink.write(record)));
  }
}

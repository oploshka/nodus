// ExecutionFileLogSink.ts
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { LogRecord, LogSink } from '@core/Logging/Log';

export class ExecutionFileLogSink implements LogSink {
  public constructor(private readonly root: string) {}

  public async write(record: LogRecord): Promise<void> {
    if (!record.executionId) return;
    const directory = join(this.root, record.executionId);
    await mkdir(directory, { recursive: true });
    await appendFile(join(directory, 'execution.log'), `${JSON.stringify(record)}\n`, 'utf8');
  }
}

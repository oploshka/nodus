// FileLogSink.ts
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { LogRecord, LogSink } from '@core/Logging/Log';

export class FileLogSink implements LogSink {
  public constructor(private readonly path: string) {}

  public async write(record: LogRecord): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${JSON.stringify(record)}\n`, 'utf8');
  }
}

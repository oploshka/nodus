// PayloadLogger.ts

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export interface PayloadContext {
  executionId: string;
  step: number;
  operation: string;
}

export class PayloadLogger {
  public constructor(
    private readonly root: string,
    private readonly path: string,
  ) {}

  public async writeRequest(context: PayloadContext, payload: unknown): Promise<string> {
    return this.write(context, 'request', payload);
  }

  public async writeResponse(context: PayloadContext, payload: unknown): Promise<string> {
    return this.write(context, 'response', payload);
  }

  private async write(
    context: PayloadContext,
    type: 'request' | 'response',
    payload: unknown,
  ): Promise<string> {
    const step = String(context.step).padStart(3, '0');
    const relativePath = [
      this.path,
      context.executionId,
      `step-${step}-${context.operation}-${type}.json`,
    ].join('/');
    const absolutePath = resolve(this.root, relativePath);

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, JSON.stringify(payload, null, 2), 'utf8');

    return relativePath;
  }
}

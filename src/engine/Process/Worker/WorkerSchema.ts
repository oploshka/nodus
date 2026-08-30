import type { sWorkerSchema } from './WorkerTsType.js';

export class WorkerSchema {
  public readonly id: string;
  public readonly prompt?: string;
  public readonly response?: unknown;
  public readonly actions: ReadonlyArray<string>;
  public readonly limits: Readonly<Record<string, number>>;

  public constructor(schema: sWorkerSchema) {
    const id = schema.id.trim();
    if (!id) throw new Error('WorkerSchema requires a non-empty id.');

    this.id = id;
    this.prompt = schema.prompt;
    this.response = schema.response;
    this.actions = [...(schema.actions ?? [])];
    this.limits = { ...(schema.limits ?? {}) };
  }
}

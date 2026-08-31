import { CORE_MODULE_RESULT } from '@engine/Core/CoreSchema.js';
import type { tCoreModuleDefinition, tCoreModuleResult } from '@engine/Core/CoreTsType.js';
import type { sWorkerRequest, sWorkerSchema } from './WorkerTsType.js';

export abstract class WorkerSchema {
  public readonly group = 'worker';
  public readonly id: string;
  public readonly dependencies: Readonly<Record<string, tCoreModuleDefinition>>;

  protected constructor(
    id: string,
    dependencies: Readonly<Record<string, tCoreModuleDefinition>> = {},
  ) {
    this.id = id;
    this.dependencies = dependencies;
  }

  protected module(name: string): string {
    if (!this.dependencies[name]) {
      throw new Error(`Worker '${this.id}' does not declare dependency '${name}'.`);
    }
    return `${this.id}::${name}`;
  }

  public abstract getSchema(request: sWorkerRequest): sWorkerSchema | Promise<sWorkerSchema>;

  public async execute(request: sWorkerRequest): Promise<tCoreModuleResult> {
    return { type: CORE_MODULE_RESULT.SCHEMA, schema: await this.getSchema(request) };
  }
}

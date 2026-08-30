import type { iWorkerModule } from './Contract/WorkerTsType.js';

export interface iWorkerResolver {
  resolve(preset: string | undefined, workers: ReadonlyArray<iWorkerModule>): iWorkerModule;
}

/** Deterministic Worker selection. Semantic selection remains outside this resolver. */
export class WorkerResolver implements iWorkerResolver {
  public resolve(preset: string | undefined, workers: ReadonlyArray<iWorkerModule>): iWorkerModule {
    if (workers.length === 0) throw new Error('WorkerResolver requires at least one Worker.');

    const byId = new Map<string, iWorkerModule>();
    for (const worker of workers) {
      const id = worker.getId().trim();
      if (!id) throw new Error('Worker id must be non-empty.');
      if (byId.has(id)) throw new Error(`Duplicate Worker id: ${id}`);
      byId.set(id, worker);
    }

    const requested = preset?.trim();
    if (requested) {
      const worker = byId.get(requested);
      if (!worker) throw new Error(`Unknown Worker preset: ${requested}`);
      return worker;
    }

    if (workers.length === 1) {
      const worker = workers[0];
      if (!worker) throw new Error('WorkerResolver requires at least one Worker.');
      return worker;
    }

    throw new Error('WORKER requires preset when several Workers are available.');
  }
}

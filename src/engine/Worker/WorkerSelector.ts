import type { PlanStep } from '@engine/Planner/Plan.js';
import type { Worker } from '@engine/Worker/Worker.js';

/**
 * Routing boundary between Engine and available Worker options.
 * The default selector is intentionally deterministic; model-based routing can
 * replace it later without changing Engine or Worker contracts.
 */
export interface WorkerSelector {
  select(step: PlanStep, workers: ReadonlyArray<Worker>): Promise<Worker>;
}

export class FirstMatchWorkerSelector implements WorkerSelector {
  public async select(step: PlanStep, workers: ReadonlyArray<Worker>): Promise<Worker> {
    const worker = workers.find((candidate) => candidate.canHandle(step));
    if (!worker) throw new Error(`No worker can handle plan step: ${step.id}`);
    return worker;
  }
}

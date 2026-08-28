export interface sTargetConfig {
  id: string;
  root: string;
  scanMode?: 'manual' | 'on-open';
  include?: string[];
  exclude?: string[];
  indexCachePath?: string;
  researchCachePath?: string;
}

export interface WorkerConfiguration {
  /** Maximum steps allowed in a Planner plan. */
  maxPlanSteps?: number;
  /** Fresh execution attempts available to one Worker.run() call. */
  maxWorkerAttempts?: number;

  /** Bounded Research questions available to one Worker.run() call. */
  maxResearchRequests?: number;

  /** Maximum model/tool rounds for AgentWorker. */
  maxAgentRounds?: number;
}

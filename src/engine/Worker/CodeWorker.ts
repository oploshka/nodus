import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { ChangeCodeActionData, ChangeCodeActionInput, ResearchActionRequest } from '@engine/Worker/Action/ChangeCodeAction.js';
import type { ResearchAnswer } from '@engine/Research/ResearchTypes.js';
import type { ResearchActionInput } from '@engine/Worker/Action/ResearchAction.js';
import type { WorkerAction } from '@engine/Worker/Action/WorkerAction.js';
import { IterativeWorker, type IterativeWorkerModelSettings } from '@engine/Worker/IterativeWorker.js';

export class CodeWorker extends IterativeWorker {
  public readonly id = 'code';
  public readonly description = 'Implement source-code, runtime behavior, configuration, and project logic changes.';

  public constructor(
    changeCode: WorkerAction<ChangeCodeActionInput, ChangeCodeActionData, ResearchActionRequest>,
    research: WorkerAction<ResearchActionInput, ResearchAnswer>,
    logger: EngineLogger,
    maxAttempts?: number,
    maxResearchRequests?: number,
    modelSettings?: IterativeWorkerModelSettings,
  ) {
    super(changeCode, research, logger, maxAttempts, maxResearchRequests, modelSettings);
  }
}

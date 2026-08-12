import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { ChangeCodeActionData, ChangeCodeActionInput, ResearchActionRequest } from '@engine/Worker/Action/ChangeCodeAction.js';
import type { ResearchAnswer } from '@engine/Research/ResearchTypes.js';
import type { ResearchActionInput } from '@engine/Worker/Action/ResearchAction.js';
import type { WorkerAction } from '@engine/Worker/Action/WorkerAction.js';
import { IterativeWorker, type IterativeWorkerModelSettings } from '@engine/Worker/IterativeWorker.js';

export class DocumentationWorker extends IterativeWorker {
  public readonly id = 'documentation';
  public readonly description = 'Update human-facing documentation, README files, examples, and explanatory project text.';

  public constructor(
    changeDocumentation: WorkerAction<ChangeCodeActionInput, ChangeCodeActionData, ResearchActionRequest>,
    research: WorkerAction<ResearchActionInput, ResearchAnswer>,
    logger: EngineLogger,
    maxAttempts?: number,
    maxResearchRequests?: number,
    modelSettings?: IterativeWorkerModelSettings,
  ) {
    super(changeDocumentation, research, logger, maxAttempts, maxResearchRequests, modelSettings);
  }
}

import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { ChangeCodeActionData, ChangeCodeActionInput, tChangeCodeActionRequest } from '@engine/Worker/Action/ChangeCodeAction.js';
import type { ResearchAnswer } from '@engine/Research/ResearchTypes.js';
import type { ResearchActionInput } from '@engine/Worker/Action/ResearchAction.js';
import type { sReadProjectActionInput } from '@engine/Worker/Action/ReadProjectAction.js';
import type { sSearchProjectActionInput } from '@engine/Worker/Action/SearchProjectAction.js';
import type { WorkerAction } from '@engine/Worker/Action/WorkerAction.js';
import { IterativeWorker, type IterativeWorkerModelSettings } from '@engine/Worker/IterativeWorker.js';
import { WorkerPresentation } from '@engine/Presentation/WorkerPresentation.js';
import type { sWorkerReadContext, sWorkerSearchContext } from '@engine/Worker/WorkerContext.js';

export class CodeWorker extends IterativeWorker {
  public readonly presentation = new WorkerPresentation({ name: { en: 'Development', ru: 'Разработка' } });
  public readonly name = this.presentation.name();
  public readonly id = 'code';
  public readonly description = 'Implement source-code, runtime behavior, configuration, and project logic changes.';

  public constructor(
    changeCode: WorkerAction<ChangeCodeActionInput, ChangeCodeActionData, tChangeCodeActionRequest>,
    read: WorkerAction<sReadProjectActionInput, sWorkerReadContext>,
    search: WorkerAction<sSearchProjectActionInput, sWorkerSearchContext>,
    research: WorkerAction<ResearchActionInput, ResearchAnswer>,
    logger: EngineLogger,
    maxAttempts?: number,
    maxResearchRequests?: number,
    modelSettings?: IterativeWorkerModelSettings,
  ) {
    super(changeCode, read, search, research, logger, maxAttempts, maxResearchRequests, undefined, modelSettings);
  }
}

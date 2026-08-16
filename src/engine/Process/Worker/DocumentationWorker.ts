import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { ChangeCodeActionData, ChangeCodeActionInput, tChangeCodeActionRequest } from '@engine/Worker/Action/ChangeCodeAction.js';
import type { ResearchAnswer } from '@engine/Research/ResearchTypes.js';
import type { ResearchActionInput } from '@engine/Worker/Action/ResearchAction.js';
import type { sReadFileActionInput } from '@engine/Worker/Action/ReadFileAction.js';
import type { sFindFileActionInput } from '@engine/Worker/Action/FindFileAction.js';
import type { WorkerAction } from '@engine/Worker/Action/WorkerAction.js';
import { IterativeWorker, type IterativeWorkerModelSettings } from '@engine/Worker/IterativeWorker.js';
import { WorkerPresentation } from '@engine/Presentation/WorkerPresentation.js';
import type { sWorkerReadContext, sWorkerSearchContext } from '@engine/Worker/WorkerContext.js';

export class DocumentationWorker extends IterativeWorker {
  public readonly presentation = new WorkerPresentation({ name: { en: 'Documentation', ru: 'Документация' } });
  public readonly name = this.presentation.name();
  public readonly id = 'documentation';
  public readonly description = 'Update human-facing documentation, README files, examples, and explanatory project text.';

  public constructor(
    changeDocumentation: WorkerAction<ChangeCodeActionInput, ChangeCodeActionData, tChangeCodeActionRequest>,
    readFile: WorkerAction<sReadFileActionInput, sWorkerReadContext>,
    findFile: WorkerAction<sFindFileActionInput, sWorkerSearchContext>,
    research: WorkerAction<ResearchActionInput, ResearchAnswer>,
    logger: EngineLogger,
    maxAttempts?: number,
    maxResearchRequests?: number,
    modelSettings?: IterativeWorkerModelSettings,
  ) {
    super(changeDocumentation, readFile, findFile, research, logger, maxAttempts, maxResearchRequests, undefined, undefined, modelSettings);
  }
}

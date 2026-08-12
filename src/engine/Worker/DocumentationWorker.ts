import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { Research } from '@engine/Research/Research.js';
import type { WorkerAttempt } from '@engine/Worker/Attempt/WorkerAttempt.js';
import { IterativeWorker } from '@engine/Worker/IterativeWorker.js';

export class DocumentationWorker extends IterativeWorker {
  public readonly id = 'documentation';
  public readonly description = 'Update human-facing documentation, README files, examples, and explanatory project text.';

  public constructor(
    attempt: WorkerAttempt,
    research: Pick<Research, 'ask'>,
    logger: EngineLogger,
    maxAttempts?: number,
    maxResearchRequests?: number,
  ) {
    super(attempt, research, logger, maxAttempts, maxResearchRequests);
  }
}

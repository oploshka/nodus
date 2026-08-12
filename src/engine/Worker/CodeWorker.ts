import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { Research } from '@engine/Research/Research.js';
import type { WorkerAttempt } from '@engine/Worker/Attempt/WorkerAttempt.js';
import { IterativeWorker } from '@engine/Worker/IterativeWorker.js';

export class CodeWorker extends IterativeWorker {
  public readonly id = 'code';
  public readonly description = 'Implement source-code, runtime behavior, configuration, and project logic changes.';

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

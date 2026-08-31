import { WorkerIterativeRunner } from '../../../src/engine/Deprecated/Worker/WorkerIterativeRunner.ts';
import { WorkerPresentation } from '../../../src/engine/Common/Presentation/WorkerPresentation.ts';

/** Legacy production Documentation Worker. New Process Worker implementations use Worker/Contract. */
export default class WorkerDocumentation extends WorkerIterativeRunner {
  presentation = new WorkerPresentation({ name: { en: 'Documentation', ru: 'Документация' } });
  name = this.presentation.name();
  id = this.getId();
  description = 'Update human-facing documentation, README files, examples, and explanatory project text.';

  constructor(
    changeDocumentation,
    readFile,
    findFile,
    research,
    logger,
    maxAttempts,
    maxResearchRequests,
    modelSettings,
  ) {
    super(changeDocumentation, readFile, findFile, research, logger, maxAttempts, maxResearchRequests, undefined, undefined, modelSettings);
  }

  getId() {
    return 'documentation';
  }

  getActions() {
    return ['find-file', 'read-file', 'research', 'change-code'];
  }
}

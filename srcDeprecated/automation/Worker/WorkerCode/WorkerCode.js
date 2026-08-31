import { WorkerIterativeRunner } from '../../../../src/engine/Deprecated/Worker/WorkerIterativeRunner.ts';
import { WorkerPresentation } from '../../../../src/engine/Common/Presentation/WorkerPresentation.ts';
import WorkerCodeResponse from './WorkerCodeResponse.js';

/** Legacy production Code Worker kept for EngineOld composition. */
export default class WorkerCode extends WorkerIterativeRunner {
  presentation = new WorkerPresentation({ name: { en: 'Development', ru: 'Разработка' } });
  name = this.presentation.name();
  id = this.getId();
  description = 'Implement source-code, runtime behavior, configuration, and project logic changes.';

  constructor(
    changeCode,
    readFile,
    findFile,
    research,
    logger,
    maxAttempts,
    maxResearchRequests,
    modelSettings,
  ) {
    super(changeCode, readFile, findFile, research, logger, maxAttempts, maxResearchRequests, undefined, undefined, modelSettings);
  }

  getId() {
    return 'code';
  }

  getPrompt() {
    return new URL('./WorkerCodePrompt.md', import.meta.url);
  }

  getResponse() {
    return WorkerCodeResponse;
  }

  getActions() {
    return ['find-file', 'read-file', 'research', 'change-code'];
  }

  getLimits() {
    return { attempts: 5, researchRequests: 2 };
  }
}

import { WorkerPresentation } from '../../../src/engine/Common/Presentation/WorkerPresentation.ts';

/** Versioned general-purpose Agent Worker backed by the Core WorkerAgentRunner mechanism. */
export default class WorkerAgent {
  presentation = new WorkerPresentation({ name: { en: 'General agent', ru: 'Универсальный агент' } });
  name = this.presentation.name();
  id = this.getId();
  description = 'General-purpose autonomous coding agent with project tools. Useful when a specialized worker is not a clear fit.';

  constructor(runner) {
    this.runner = runner;
  }

  getId() {
    return 'agent';
  }

  canHandle() {
    return true;
  }

  run(data, instrument) {
    return this.runner.run(this, data, instrument);
  }
}

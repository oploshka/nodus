import codeChange from './schemas/code-change.js';
import defaultPlanner from './planners/default.js';
import codeWorker from './workers/code.js';
import changeCodeResponse from './responses/change-code.js';
import plannerResponse from './responses/planner.js';

export default {
  prompts: {
    planner: 'prompts/planner.md',
    'worker-code': 'prompts/worker-code.md',
  },
  schemas: {
    'code-change': codeChange,
  },
  planners: {
    default: defaultPlanner,
  },
  workers: {
    code: codeWorker,
  },
  responses: {
    planner: plannerResponse,
    'change-code': changeCodeResponse,
  },
};

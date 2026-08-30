import codeChange from './schemas/code-change.js';
import planner from './schemas/planner.js';
import defaultPlanner from './planners/default.js';
import codeWorker from './workers/code.js';
import changeCodeResponse from './responses/change-code.js';
import plannerResponse from './responses/planner.js';
import qualifierResponse from './responses/qualifier.js';

export default {
  prompts: {
    qualifier: 'prompts/qualifier.md',
    planner: 'prompts/planner.md',
    'worker-code': 'prompts/worker-code.md',
  },
  schemas: {
    planner,
    'code-change': codeChange,
  },
  planners: {
    default: defaultPlanner,
  },
  workers: {
    code: codeWorker,
  },
  responses: {
    qualifier: qualifierResponse,
    planner: plannerResponse,
    'change-code': changeCodeResponse,
  },
};

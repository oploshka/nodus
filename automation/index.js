import { Planner } from '#automation/Step/Planner/Planner.ts';
import WorkerCode from '#automation/Step/Worker/WorkerCode/WorkerCode.ts';

export default {
  groups: {
    planner: {
      schema: {
        allowedGroups: ['worker', 'research'],
      },
    },
    worker: {
      schema: {
        allowedGroups: ['action', 'research'],
      },
    },
    research: {
      schema: {
        allowedGroups: ['action'],
      },
    },
    action: {
      schema: false,
    },
  },

  modules: {
    Planner: new Planner(),
    WorkerCode: new WorkerCode(),
  },
};

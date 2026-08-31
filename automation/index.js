import { ApplyEditAction as ActionEditApply } from '#automation/Step/Action/ActionApplyEdit.ts';
import { ChangeCodeAction as ActionCodeChange } from '#automation/Step/Action/ActionChangeCode.ts';
import { FindFileAction as ActionFileFind } from '#automation/Step/Action/ActionFindFile.ts';
import { ReadFileAction as ActionFileRead } from '#automation/Step/Action/ActionReadFile.ts';
import { ResearchAction as ActionResearch } from '#automation/Step/Action/ActionResearch.ts';
import { PlannerModel } from '#automation/Step/Planner/PlannerModel.ts';
import PlannerTask from '#automation/Step/Planner/PlannerTask/PlannerTask.js';
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
    PlannerTask,
    PlannerModel,
    WorkerCode,
    ActionCodeChange,
    ActionFileFind,
    ActionFileRead,
    ActionResearch,
    ActionEditApply,
  },
};

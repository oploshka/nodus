import PlannerTask from '#automation/Planner/PlannerTask/PlannerTask.js';
import QualifierTask from '#automation/Qualifier/QualifierTask/QualifierTask.js';
import WorkerCode from '#automation/Worker/WorkerCode/WorkerCode.js';

export default {
  planners: {
    task: PlannerTask,
  },
  qualifiers: {
    task: QualifierTask,
  },
  workers: {
    code: WorkerCode,
  },
};

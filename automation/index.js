import { ChangeCodeAction } from '#automation/Action/ChangeCodeAction.ts';
import { FindFileAction } from '#automation/Action/FindFileAction.ts';
import { ReadFileAction } from '#automation/Action/ReadFileAction.ts';
import { ResearchAction } from '#automation/Action/ResearchAction.ts';
import PlannerTask from '#automation/Planner/PlannerTask/PlannerTask.js';
import QualifierTask from '#automation/Qualifier/QualifierTask/QualifierTask.js';
import WorkerAgent from '#automation/Worker/WorkerAgent/WorkerAgent.js';
import WorkerCode from '#automation/Worker/WorkerCode/WorkerCode.js';
import WorkerDocumentation from '#automation/Worker/WorkerDocumentation/WorkerDocumentation.js';

export default {
  planners: {
    task: PlannerTask,
  },
  qualifiers: {
    task: QualifierTask,
  },
  workers: {
    agent: WorkerAgent,
    code: WorkerCode,
    documentation: WorkerDocumentation,
  },
  actions: {
    'change-code': ChangeCodeAction,
    'find-file': FindFileAction,
    'read-file': ReadFileAction,
    research: ResearchAction,
  },
};

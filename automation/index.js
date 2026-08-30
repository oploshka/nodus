import { ChangeCodeAction } from '#automation/Action/ActionChangeCode.ts';
import { FindFileAction } from '#automation/Action/ActionFindFile.ts';
import { ReadFileAction } from '#automation/Action/ActionReadFile.ts';
import { ResearchAction } from '#automation/Action/ActionResearch.ts';
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

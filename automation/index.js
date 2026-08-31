import { ChangeCodeAction } from '#automation/Action/ActionChangeCode.ts';
import { FindFileAction } from '#automation/Action/ActionFindFile.ts';
import { ReadFileAction } from '#automation/Action/ActionReadFile.ts';
import { ResearchAction } from '#automation/Action/ActionResearch.ts';
import { DetermineModel } from '#automation/Deprecated/Determine/DetermineModel.ts';
import { PlannerModel } from '#automation/Planner/PlannerModel.ts';
import PlannerTask from '#automation/Planner/PlannerTask/PlannerTask.js';
import QualifierTask from '#automation/Deprecated/Qualifier/QualifierTask/QualifierTask.js';
import { ResearchBoundedModelResolver } from '#automation/Deprecated/Research/ResearchBoundedModelResolver.ts';
import WorkerAgent from '#automation/Deprecated/Worker/WorkerAgent/WorkerAgent.js';
import WorkerCode from '#automation/Deprecated/Worker/WorkerCode/WorkerCode.js';
import WorkerDocumentation from '#automation/Deprecated/Worker/WorkerDocumentation/WorkerDocumentation.js';

export default {
  planners: {
    task: PlannerTask,
    model: PlannerModel,
  },
  qualifiers: {
    task: QualifierTask,
  },
  determine: {
    model: DetermineModel,
  },
  research: {
    'bounded-model': ResearchBoundedModelResolver,
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

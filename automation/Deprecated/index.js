import { ChangeCodeAction } from '#automation/Action/ActionChangeCode.ts';
import { FindFileAction } from '#automation/Action/ActionFindFile.ts';
import { ReadFileAction } from '#automation/Action/ActionReadFile.ts';
import { ResearchAction } from '#automation/Action/ActionResearch.ts';
import { DetermineModel } from '#automation/Deprecated/Determine/DetermineModel.ts';
import QualifierTask from '#automation/Deprecated/Qualifier/QualifierTask/QualifierTask.js';
import { ResearchBoundedModelResolver } from '#automation/Deprecated/Research/ResearchBoundedModelResolver.ts';
import WorkerAgent from '#automation/Deprecated/Worker/WorkerAgent/WorkerAgent.js';
import WorkerCode from '#automation/Deprecated/Worker/WorkerCode/WorkerCode.js';
import WorkerDocumentation from '#automation/Deprecated/Worker/WorkerDocumentation/WorkerDocumentation.js';
import { PlannerModel } from '#automation/Planner/PlannerModel.ts';
import PlannerTask from '#automation/Planner/PlannerTask/PlannerTask.js';

export default {
  PlannerTask,
  PlannerModel,
  QualifierTask,
  DetermineModel,
  ResearchBoundedModelResolver,
  WorkerAgent,
  WorkerCode,
  WorkerDocumentation,
  ChangeCodeAction,
  FindFileAction,
  ReadFileAction,
  ResearchAction,
};

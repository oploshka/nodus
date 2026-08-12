import type { TaskPlan } from '@planner/TaskPlan';
import type { StepEvidenceItem } from '@model/Result/OperationResult';

export interface ScenarioSeedFact {
  key: string;
  value: string;
  evidence?: StepEvidenceItem[];
}

export interface ScenarioStepExpectation {
  step: number;
  type: string;
  expectedOutputs?: string[];
  expectedContextKeys?: string[];
  expectedRetrieval?: 'exact' | 'related' | 'missing';
  expectedValueIncludes?: Record<string, string[]>;
  forbiddenValueIncludes?: Record<string, string[]>;
  expectedMissingIncludes?: string[];
  forbiddenMissingIncludes?: string[];
  expectModelCalls?: 'none' | 'some';
  expectToolCalls?: 'none' | 'some';
  expectedChangePaths?: string[];
  changeContentIncludes?: string[];
  changeContentForbids?: string[];
  changeContentScope?: { start: string; end: string };
}

export interface ModelScenarioSchema {
  id: string;
  task: string;
  plan: TaskPlan;
  inputsBeforeStep: Record<number, ScenarioSeedFact[]>;
  expectations: Record<number, ScenarioStepExpectation>;
}

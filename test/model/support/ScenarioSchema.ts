import type { TaskPlan } from '@agent/Planning/TaskPlan';
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
}

export interface ModelScenarioSchema {
  id: string;
  task: string;
  plan: TaskPlan;
  inputsBeforeStep: Record<number, ScenarioSeedFact[]>;
  expectations: Record<number, ScenarioStepExpectation>;
}

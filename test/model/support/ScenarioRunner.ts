import assert from 'node:assert/strict';
import type { PlanStep } from '@agent/Planning/TaskPlan';
import type { FileChange } from '@core/Change/ChangeSet';
import type { ModelExecutionInput } from '@model/Controller/ModelController';
import { runPlanHarness } from '@test/support/StepHarness';
import { createRealScenarioRuntime } from '@test/model/support/RealScenarioRuntime';
import type { ModelScenarioSchema, ScenarioSeedFact, ScenarioStepExpectation } from '@test/model/support/ScenarioSchema';

export interface ScenarioRunResult {
  modelCalls: number;
  toolCalls: number;
  appliedChanges: FileChange[];
  state: Awaited<ReturnType<typeof runPlanHarness>>['state'];
  modelInputs: ModelExecutionInput[];
}

export async function testStep(schema: ModelScenarioSchema, stepNumber: number): Promise<ScenarioRunResult> {
  const step = cloneStep(getStep(schema, stepNumber));
  const runtime = await createRealScenarioRuntime();
  const result = await runPlanHarness({
    taskDescription: schema.task,
    plan: { version: schema.plan.version, goal: schema.plan.goal, steps: [step] },
    seedFacts: schema.inputsBeforeStep[stepNumber] ?? [],
    operationRegistry: runtime.operationRegistry,
    model: (input) => runtime.modelController.execute(input),
    tool: async (calls, execution) => (await runtime.toolExecutor.execute(calls, execution, {}, 5)).executed,
    change: async () => {},
  });
  const output: ScenarioRunResult = { ...result, modelInputs: runtime.modelInputs };
  assertExpectation(schema.expectations[stepNumber], output, step);
  return output;
}

export async function testChain(schema: ModelScenarioSchema, fromStep: number, toStep: number): Promise<ScenarioRunResult> {
  assert.ok(fromStep >= 1 && toStep >= fromStep && toStep <= schema.plan.steps.length);

  let seedFacts: ScenarioSeedFact[] = fromStep === 1 ? [] : [...(schema.inputsBeforeStep[fromStep] ?? [])];
  let finalResult: ScenarioRunResult | undefined;
  let totalModelCalls = 0;
  let totalToolCalls = 0;
  const appliedChanges: FileChange[] = [];
  const modelInputs: ModelExecutionInput[] = [];

  for (let number = fromStep; number <= toStep; number += 1) {
    const step = cloneStep(getStep(schema, number));
    const runtime = await createRealScenarioRuntime();
    const result = await runPlanHarness({
      taskDescription: schema.task,
      plan: { version: schema.plan.version, goal: schema.plan.goal, steps: [step] },
      seedFacts,
      operationRegistry: runtime.operationRegistry,
      model: (input) => runtime.modelController.execute(input),
      tool: async (calls, execution) => (await runtime.toolExecutor.execute(calls, execution, {}, 5)).executed,
      change: async () => {},
    });

    const stepOutput: ScenarioRunResult = { ...result, modelInputs: runtime.modelInputs };

    // Chain semantics are intentionally fail-fast. If a real step diverges from the
    // scenario contract, later steps would receive invalid state and their failures
    // would be diagnostic noise rather than independent information.
    assertExpectation(schema.expectations[number], stepOutput, step);

    totalModelCalls += stepOutput.modelCalls;
    totalToolCalls += stepOutput.toolCalls;
    appliedChanges.push(...stepOutput.appliedChanges);
    modelInputs.push(...stepOutput.modelInputs);

    // Unlike testStep(), a chain must propagate the REAL state produced by the
    // previous step. This is what lets chain tests detect broken step boundaries.
    seedFacts = stepOutput.state.executionContext.all().map((fact) => ({
      key: fact.key,
      value: fact.value,
      evidence: fact.evidence,
    }));

    finalResult = {
      ...stepOutput,
      modelCalls: totalModelCalls,
      toolCalls: totalToolCalls,
      appliedChanges: [...appliedChanges],
      modelInputs: [...modelInputs],
    };
  }

  assert.ok(finalResult, `Scenario ${schema.id} chain produced no steps`);
  return finalResult;
}

function assertExpectation(expectation: ScenarioStepExpectation | undefined, result: ScenarioRunResult, step: PlanStep): void {
  if (!expectation) return;
  assert.equal(step.type, expectation.type, `step ${expectation.step}: unexpected type`);
  const stepResult = result.state.stepResults.get(step.id);
  const context = result.state.executionContext;

  for (const key of expectation.expectedOutputs ?? []) assert.ok(context.has(key), `step ${expectation.step}: expected output is not ready: ${key}`);
  for (const key of expectation.expectedContextKeys ?? []) assert.ok(context.has(key), `step ${expectation.step}: expected context fact is missing: ${key}`);
  if (expectation.expectedRetrieval) assert.equal(stepResult?.retrieval?.match, expectation.expectedRetrieval, `step ${expectation.step}: retrieval match`);

  for (const [key, fragments] of Object.entries(expectation.expectedValueIncludes ?? {})) {
    const value = context.select([key])[0]?.value ?? '';
    for (const fragment of fragments) assert.ok(value.includes(fragment), `step ${expectation.step}: ${key} must include ${fragment}`);
  }
  for (const [key, fragments] of Object.entries(expectation.forbiddenValueIncludes ?? {})) {
    const value = context.select([key])[0]?.value ?? '';
    for (const fragment of fragments) assert.ok(!value.includes(fragment), `step ${expectation.step}: ${key} must not include ${fragment}`);
  }
  for (const missing of expectation.expectedMissingIncludes ?? []) assert.ok(stepResult?.missing.some((item) => item.includes(missing)), `step ${expectation.step}: expected missing ${missing}`);
  for (const missing of expectation.forbiddenMissingIncludes ?? []) assert.ok(!stepResult?.missing.some((item) => item.includes(missing)), `step ${expectation.step}: must not report missing ${missing}`);

  const modelCallsForStep = result.modelInputs.filter((input) => input.activeStep?.id === step.id).length;
  if (expectation.expectModelCalls === 'none') assert.equal(modelCallsForStep, 0, `step ${expectation.step}: should be deterministic`);
  if (expectation.expectModelCalls === 'some') assert.ok(modelCallsForStep > 0, `step ${expectation.step}: expected a model call`);
  if (expectation.expectToolCalls === 'some') assert.ok(result.toolCalls > 0, `step ${expectation.step}: expected tool calls`);

  if (expectation.expectedChangePaths?.length) assert.deepEqual(result.appliedChanges.map((change) => change.path), expectation.expectedChangePaths);
  if (expectation.changeContentIncludes?.length || expectation.changeContentForbids?.length) {
    const content = result.appliedChanges.filter((change): change is Extract<FileChange, { type: 'write' }> => change.type === 'write').map((change) => change.content).join('\n');
    for (const fragment of expectation.changeContentIncludes ?? []) assert.ok(content.includes(fragment), `step ${expectation.step}: change must include ${fragment}`);
    for (const fragment of expectation.changeContentForbids ?? []) assert.ok(!content.includes(fragment), `step ${expectation.step}: change must not include ${fragment}`);
  }
}

function getStep(schema: ModelScenarioSchema, stepNumber: number): PlanStep {
  const step = schema.plan.steps[stepNumber - 1];
  if (!step) throw new Error(`Scenario ${schema.id} has no step ${stepNumber}`);
  return step;
}

function cloneStep(step: PlanStep): PlanStep {
  return {
    ...step,
    status: 'pending',
    inputs: [...step.inputs],
    outputs: [...step.outputs],
    sourceHints: step.sourceHints ? [...step.sourceHints] : undefined,
    requirements: step.requirements?.map((item) => ({ ...item, constraints: item.constraints ? [...item.constraints] : undefined })),
  };
}

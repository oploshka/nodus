// ChangeDefinitionCompiler.ts
import { parseWorkflowDataRef } from '@planner/WorkflowData';
import type { ExecutionFact } from '@planner/PlannerContext';
import type { PlanStep } from '@planner/TaskPlan';
import type { StepResult } from '@model/Result/OperationResult';

export class ChangeDefinitionCompiler {
  public compile(step: PlanStep, facts: ExecutionFact[]): StepResult | undefined {
    if (step.type !== 'prepare-change' || !step.targetPath || step.outputs.length !== 1) return undefined;

    try {
      if (parseWorkflowDataRef(step.outputs[0]).kind !== 'change-definition') return undefined;
      if (step.inputs.some((input) => parseWorkflowDataRef(input).kind !== 'fact')) return undefined;
    } catch {
      return undefined;
    }

    const byKey = new Map(facts.map((fact) => [fact.key, fact]));
    if (step.inputs.some((key) => !byKey.has(key))) return undefined;

    const constraints = Array.from(new Set((step.requirements ?? []).flatMap((item) => item.constraints ?? [])));
    const lines = [
      `Target: ${step.targetPath}`,
      `Intent: ${step.subject ?? step.goal}`,
      'Established facts:',
      ...step.inputs.map((key) => `- ${key} = ${byKey.get(key)?.value ?? ''}`),
      ...(constraints.length > 0 ? ['Constraints:', ...constraints.map((constraint) => `- ${constraint}`)] : []),
    ];
    const evidence = step.inputs.flatMap((key) => byKey.get(key)?.evidence ?? []);

    return {
      goalSatisfied: true,
      targets: [step.targetPath],
      findings: [`Prepared deterministic change contract for ${step.targetPath}.`],
      evidence,
      missing: [],
      facts: [{ key: step.outputs[0], value: lines.join('\n'), evidence }],
    };
  }
}

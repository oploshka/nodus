import type { FactKey, PlanStep } from '@agent/Planning/TaskPlan';
import type { StepEvidenceItem, StepFact, StepResult } from '@model/Result/OperationResult';

export interface ExecutionFact {
  key: FactKey;
  value: string;
  evidence: StepEvidenceItem[];
  producerStepId: string;
}

export interface ComposedStepContext {
  facts: ExecutionFact[];
  missingInputs: FactKey[];
}

export class ExecutionContext {
  private readonly facts = new Map<FactKey, ExecutionFact>();

  public mergeStepResult(step: PlanStep, result: StepResult): FactKey[] {
    const before = new Map(this.facts);
    for (const fact of result.facts) {
      if (step.outputs.includes(fact.key)) this.put(step.id, fact);
    }

    if (result.goalSatisfied) {
      const summary = result.findings.join(' ').trim();
      for (const key of step.outputs) {
        if (this.facts.has(key) || !summary) continue;
        this.facts.set(key, {
          key,
          value: summary,
          evidence: result.evidence,
          producerStepId: step.id,
        });
      }
    }

    return step.outputs.filter((key) => {
      const previous = before.get(key);
      const current = this.facts.get(key);
      return Boolean(current && (!previous || previous.value !== current.value));
    });
  }

  public has(key: FactKey): boolean {
    return this.facts.has(key);
  }

  public compose(step: PlanStep): ComposedStepContext {
    const facts: ExecutionFact[] = [];
    const missingInputs: FactKey[] = [];
    for (const key of step.inputs) {
      const fact = this.facts.get(key);
      if (fact) facts.push(fact);
      else missingInputs.push(key);
    }
    return { facts, missingInputs };
  }

  public all(): ExecutionFact[] {
    return Array.from(this.facts.values());
  }

  private put(stepId: string, fact: StepFact): void {
    const key = fact.key.trim();
    const value = fact.value.trim();
    if (!key || !value) return;
    this.facts.set(key, {
      key,
      value,
      evidence: fact.evidence,
      producerStepId: stepId,
    });
  }
}

// RequirementConstraintValidator.ts
import type { PlanStep, StepRequirementContract } from '@agent/Planning/TaskPlan';
import type { StepFact, StepResult } from '@model/Result/OperationResult';

interface ConstraintViolation {
  constraint: string;
  reason: string;
}

const MUTATING_CALL = /(?:\.|\b)(scan|refresh|write|delete|remove|create|save|update|set[A-Z_a-z][A-Za-z0-9_]*)\s*\(/i;
const SCAN_REFRESH_CALL = /(?:\.|\b)(scan|refresh)\s*\(/i;

export class RequirementConstraintValidator {
  public validate(step: PlanStep, result: StepResult): StepResult {
    if (!step.requirements?.length || result.facts.length === 0) return result;

    const contracts = new Map(step.requirements.map((contract) => [contract.ref, contract]));
    const accepted: StepFact[] = [];
    const rejected: Array<{ fact: StepFact; violation: ConstraintViolation }> = [];

    for (const fact of result.facts) {
      const contract = contracts.get(fact.key);
      const violation = this.placeholderViolation(fact.value) ?? (contract ? this.violation(contract, fact.value) : undefined);
      if (violation) rejected.push({ fact, violation });
      else accepted.push(fact);
    }

    if (rejected.length === 0) return result;

    const missing = Array.from(new Set([
      ...result.missing,
      ...rejected.map(({ fact }) => fact.key),
    ])).filter((key) => !accepted.some((fact) => fact.key === key));
    const findings = [
      ...result.findings,
      ...rejected.map(({ fact, violation }) => `Rejected ${fact.key}: ${violation.reason}`),
    ];

    return {
      ...result,
      goalSatisfied: step.outputs.every((key) => accepted.some((fact) => fact.key === key)) && missing.length === 0,
      findings,
      missing,
      facts: accepted,
    };
  }

  private placeholderViolation(value: string): ConstraintViolation | undefined {
    if (!/^(?:missing|unknown|unavailable|n\/a)$/i.test(value.trim())) return undefined;
    return { constraint: 'concrete-value', reason: 'fact contains a placeholder instead of a concrete reusable value' };
  }

  private violation(contract: StepRequirementContract, value: string): ConstraintViolation | undefined {
    const constraints = new Set((contract.constraints ?? []).map((constraint) => constraint.trim().toLowerCase()));
    if (constraints.size === 0) return undefined;

    if (constraints.has('must-not-scan-or-refresh') && SCAN_REFRESH_CALL.test(value)) {
      return {
        constraint: 'must-not-scan-or-refresh',
        reason: 'fact uses scan()/refresh() even though the requirement permits only existing-state access',
      };
    }

    if ((constraints.has('read-only') || constraints.has('no-side-effects')) && MUTATING_CALL.test(value)) {
      return {
        constraint: constraints.has('no-side-effects') ? 'no-side-effects' : 'read-only',
        reason: 'fact contains a mutating method call and cannot satisfy a read-only/no-side-effects contract',
      };
    }

    if (constraints.has('existing-state') && SCAN_REFRESH_CALL.test(value)) {
      return {
        constraint: 'existing-state',
        reason: 'fact rebuilds/refreshes state instead of reading the already available state',
      };
    }

    return undefined;
  }
}

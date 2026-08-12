// RequirementConstraintValidatorSmoke.ts
import { RequirementConstraintValidator } from '@planner/RequirementConstraintValidator';
import type { PlanStep } from '@planner/TaskPlan';

const step: PlanStep = {
  id: 'understand-index',
  type: 'understand',
  action: 'determine-integration',
  subject: 'current index access',
  goal: 'determine current index access',
  status: 'pending',
  maxAttempts: 1,
  inputs: [],
  outputs: ['fact:project.index.fileCount.access@cli'],
  requirements: [{
    ref: 'fact:project.index.fileCount.access@cli',
    description: 'read file count from the already available index',
    constraints: ['read-only', 'existing-state', 'no-side-effects', 'must-not-scan-or-refresh', 'nullable'],
  }],
};

const validator = new RequirementConstraintValidator();
const bad = validator.validate(step, {
  goalSatisfied: true,
  findings: ['candidate'],
  evidence: [],
  missing: [],
  facts: [{ key: step.outputs[0], value: 'Use (await nodus.projectSession.scan()).files.length', evidence: [] }],
});
if (bad.goalSatisfied) throw new Error('Constraint-violating fact must not satisfy understand');
if (bad.facts.length !== 0) throw new Error('Constraint-violating fact must be removed');
if (!bad.missing.includes(step.outputs[0])) throw new Error('Rejected fact must become an explicit missing requirement');

const good = validator.validate(step, {
  goalSatisfied: true,
  findings: ['candidate'],
  evidence: [],
  missing: [],
  facts: [{ key: step.outputs[0], value: 'Use nodus.projectSession.index?.files.length and handle undefined index.', evidence: [] }],
});
if (!good.goalSatisfied || good.facts.length !== 1) throw new Error('Compliant read-only existing-state fact should pass');

const rejectedPlaceholder = validator.validate(step, {
  goalSatisfied: true,
  findings: [],
  evidence: [],
  missing: [],
  facts: [{ key: step.outputs[0], value: 'MISSING', evidence: [] }],
});
if (rejectedPlaceholder.goalSatisfied) throw new Error('Placeholder model fact must not satisfy understand');
if (rejectedPlaceholder.facts.length !== 0) throw new Error('Placeholder model fact must be removed');
if (!rejectedPlaceholder.missing.includes(step.outputs[0])) throw new Error('Placeholder model fact must become an explicit missing output');

console.log('## requirement constraint validator');
console.log('scan()/refresh()-style fact rejected for read-only existing-state contract: OK');
console.log('optional current-index read accepted: OK');
console.log('placeholder fact rejected without deriving an answer from requirement text: OK');
console.log('PASS');

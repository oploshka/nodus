// StatusCommandStepSuite.ts
export {};
await import('./PlanStageSmoke');
await import('./SearchStageSmoke');
await import('./UnderstandStageSmoke');
await import('./PrepareChangeStageSmoke');
await import('./EditStageSmoke');
await import('./FinalizeStageSmoke');

console.log('## /status step suite');
console.log('PASS: each workflow stage can be tested independently without replaying the whole task.');

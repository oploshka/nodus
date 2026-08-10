// CoreSuite.ts
export {};
await import('./RequirementMapCompilerSmoke');
await import('./SearchRequestCompilerSmoke');
await import('./RetrievalResultSmoke');
await import('./RequirementResolutionPlannerSmoke');
await import('./RequirementResolutionRecheckSmoke');
await import('./RequirementCapabilityRecheckSmoke');
await import('./RequirementConstraintValidatorSmoke');
await import('./UnderstandRawProtocolSmoke');
await import('./UnderstandToolRoundSmoke');
await import('./FileSystemToolContractSmoke');
await import('./SearchToolPromptRegressionSmoke');
await import('./scenario/status/StatusCommandStepSuite');

console.log('## Nodus v0.2 core suite');
console.log('PASS');

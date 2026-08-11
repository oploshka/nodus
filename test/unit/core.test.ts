import test from 'node:test';

const contracts = [
  './contracts/RequirementMapCompilerSmoke.ts',
  './contracts/SearchRequestCompilerSmoke.ts',
  './contracts/RetrievalResultSmoke.ts',
  './contracts/RequirementResolutionPlannerSmoke.ts',
  './contracts/RequirementResolutionRecheckSmoke.ts',
  './contracts/RequirementCapabilityRecheckSmoke.ts',
  './contracts/RequirementConstraintValidatorSmoke.ts',
  './contracts/UnderstandRawProtocolSmoke.ts',
  './contracts/FileSystemToolContractSmoke.ts',
  './contracts/SearchToolPromptRegressionSmoke.ts',
  './contracts/EditFilePatchProtocolSmoke.ts',
  './contracts/EditFileApplyRetrySmoke.ts',
] as const;

for (const modulePath of contracts) {
  test(`contract: ${modulePath.split('/').pop()?.replace('Smoke.ts', '')}`, async () => {
    await import(modulePath);
  });
}

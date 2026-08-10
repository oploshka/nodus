import test from 'node:test';

const stages = [
  './status/PlanStageSmoke.ts',
  './status/SearchStageSmoke.ts',
  './status/UnderstandStageSmoke.ts',
  './status/PrepareChangeStageSmoke.ts',
  './status/EditStageSmoke.ts',
  './status/FinalizeStageSmoke.ts',
] as const;

for (const modulePath of stages) {
  test(`status stage: ${modulePath.split('/').pop()?.replace('StageSmoke.ts', '')}`, async () => {
    await import(modulePath);
  });
}

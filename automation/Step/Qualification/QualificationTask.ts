import { EngineStep } from '@engine/EngineStep.js';
import type { iEngineStep } from '@engine/EngineStepInterface.js';
import { Planner } from '@automation/Step/Planner/Planner.js';
import { WorkerExample } from '@automation/Step/Worker/WorkerExample.js';
import { ActionQualification, type sQualificationResult } from './ActionQualification.js';

interface sQualificationTaskOptions {
  allowPlanning?: boolean;
  worker?: iEngineStep;
}

/** Routes one task either into Planner or directly into Worker. */
export class QualificationTask extends EngineStep {
  private readonly allowPlanning: boolean;
  private readonly worker: iEngineStep;

  private readonly points = {
    qualify: this.point({
      step: new ActionQualification(),
      response: async (result, dsl) => {
        const qualification = readQualification(result);

        if (qualification.type === 'multi' && this.allowPlanning) {
          const nestedQualification = new QualificationTask({
            allowPlanning: false,
            worker: this.worker,
          });
          const value = await dsl.runStep(
            new Planner(nestedQualification),
            qualification.input,
          );
          return value;
        }

        const value = await dsl.runStep(this.worker, qualification.input);
        return value;
      },
    }),
  };

  public constructor(options: sQualificationTaskOptions = {}) {
    super();
    this.allowPlanning = options.allowPlanning ?? true;
    this.worker = options.worker ?? new WorkerExample();
  }

  public getId(): string {
    return 'QualificationTask';
  }

  public getGroup(): string {
    return 'qualification';
  }

  public async run(_input: unknown): Promise<unknown> {
    return this.points.qualify;
  }
}

function readQualification(value: unknown): sQualificationResult {
  if (typeof value !== 'object' || value === null) {
    throw new Error('ActionQualification must return a qualification result.');
  }

  const result = value as Partial<sQualificationResult>;
  if (result.type !== 'simple' && result.type !== 'multi') {
    throw new Error('ActionQualification returned an unknown qualification type.');
  }

  return result as sQualificationResult;
}

import type { EnginePoint } from '@engine/EnginePoint.js';
import { EngineStep } from '@engine/EngineStep.js';
import type { iEngineStep } from '@engine/EngineStepInterface.js';
import { Planner } from '@automation/Step/Planner/Planner.js';
import WorkerCode from '@automation/Step/Worker/WorkerCode/WorkerCode.js';
import { ActionQualification, type sQualificationResult } from './ActionQualification.js';

interface sQualificationTaskOptions {
  allowPlanning?: boolean;
  worker?: iEngineStep;
}

interface sQualificationPoints {
  qualify: EnginePoint;
  worker: EnginePoint;
  planner?: EnginePoint;
}

/** Root routing schema: qualification -> planner or worker. */
export class QualificationTask extends EngineStep {
  private readonly points: sQualificationPoints;

  public constructor(options: sQualificationTaskOptions = {}) {
    super();

    const worker = options.worker ?? new WorkerCode();
    const allowPlanning = options.allowPlanning ?? true;

    const workerPoint = this.point({
      name: 'worker',
      step: worker,
    });

    const plannerPoint = allowPlanning
      ? this.point({
        name: 'planner',
        step: new Planner(new QualificationTask({
          allowPlanning: false,
          worker,
        })),
      })
      : undefined;

    const qualifyPoint = this.point({
      name: 'qualification',
      step: new ActionQualification(),
      options: () => [
        ...(plannerPoint ? [{ point: plannerPoint }] : []),
        { point: workerPoint },
      ],
      response: ({ result }) => {
        const qualification = readQualification(result);
        if (qualification.type === 'multi' && plannerPoint) {
          return this.pointNext(plannerPoint, qualification.input);
        }
        return this.pointNext(workerPoint, qualification.input);
      },
    });

    this.points = {
      qualify: qualifyPoint,
      worker: workerPoint,
      planner: plannerPoint,
    };
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

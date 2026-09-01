import { EngineStep } from '@engine/EngineStep.js';

export interface sPlanResultRef {
  resultOf: string;
}

export interface sPlannedStep {
  id: string;
  task: string;
  context?: Readonly<Record<string, sPlanResultRef>>;
}

export interface sActionPlanResult {
  steps: readonly sPlannedStep[];
}

/** Hardcoded plan for the JSON/YAML/XML example. */
export class ActionPlan extends EngineStep {
  public getId(): string {
    return 'ActionPlan';
  }

  public getGroup(): string {
    return 'action';
  }

  public async run(_input: unknown): Promise<sActionPlanResult> {
    return {
      steps: [
        { id: '1', task: 'Изучи JSON' },
        { id: '2', task: 'Изучи YAML' },
        { id: '3', task: 'Изучи XML' },
        {
          id: '4',
          task: 'Сравни JSON, YAML и XML',
          context: {
            json: { resultOf: '1' },
            yaml: { resultOf: '2' },
            xml: { resultOf: '3' },
          },
        },
      ],
    };
  }
}

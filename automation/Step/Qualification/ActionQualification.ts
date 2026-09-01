import { EngineStep } from '@engine/EngineStep.js';

export type tQualificationType = 'simple' | 'multi';

export interface sQualificationResult {
  type: tQualificationType;
  input: unknown;
}

/** Hardcoded qualification used to exercise the new nested Step model. */
export class ActionQualification extends EngineStep {
  public getId(): string {
    return 'ActionQualification';
  }

  public getGroup(): string {
    return 'action';
  }

  public async run(input: unknown): Promise<sQualificationResult> {
    return {
      type: isMultiFormatTask(input) ? 'multi' : 'simple',
      input,
    };
  }
}

function isMultiFormatTask(input: unknown): boolean {
  const task = readTask(input).toLowerCase();
  return ['json', 'yaml', 'xml'].every((format) => task.includes(format))
    && (task.includes('сравн') || task.includes('compare'));
}

function readTask(input: unknown): string {
  if (typeof input === 'string') return input;
  if (typeof input !== 'object' || input === null) return '';
  const task = (input as { task?: unknown }).task;
  return typeof task === 'string' ? task : '';
}

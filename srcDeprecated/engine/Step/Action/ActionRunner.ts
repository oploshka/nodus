import { STEP } from '@engine/Process/ProcessSchema.js';
import { ProcessStepRunner } from '@engine/Process/ProcessStepRunner.js';
import type { iProcessStepResolver } from '@engine/Process/ProcessStepResolver.js';
import type { iActionStep, sActionRequest, tActionResult } from './Contract/ActionTsType.js';

/** ACTION semantic role. The schema `action` field is the deterministic implementation id. */
export class ActionRunner extends ProcessStepRunner<STEP.ACTION, sActionRequest, tActionResult> {
  public constructor(
    actions: ReadonlyArray<iActionStep>,
    resolver?: iProcessStepResolver,
  ) {
    super(
      STEP.ACTION,
      actions,
      resolver,
      (step) => step.type === STEP.ACTION ? step.action : undefined,
      (step, context, task) => {
        if (step.type !== STEP.ACTION) throw new Error(`ActionRunner cannot execute ${step.type}.`);
        return {
          type: STEP.ACTION,
          action: step.action,
          task,
          context,
        };
      },
    );
  }
}

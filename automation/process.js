export const STEP = Object.freeze({
  SEQUENCE: 'SEQUENCE',
  QUALIFY: 'QUALIFY',
  PLAN: 'PLAN',
  WORKER: 'WORKER',
  ACTION: 'ACTION',
  VALIDATE: 'VALIDATE',
  REPLAN: 'REPLAN',
});

export const ACTION = Object.freeze({
  ASK_USER: 'ASK_USER',
});

export const TASK_TYPE = Object.freeze({
  SIMPLE: 'SIMPLE',
  MULTI: 'MULTI',
  PROCESS: 'PROCESS',
});

export function cloneProcessSteps(steps) {
  return steps.map(cloneProcessStep);
}

function cloneProcessStep(step) {
  const copy = {
    ...step,
    output: undefined,
  };

  if (step.input) {
    copy.input = {
      ...step.input,
      context: step.input.context
        ? {
            ...step.input.context,
            steps: step.input.context.steps ? [...step.input.context.steps] : undefined,
          }
        : undefined,
    };
  }

  if (Array.isArray(step.steps)) copy.steps = cloneProcessSteps(step.steps);
  return copy;
}

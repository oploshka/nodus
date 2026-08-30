import { STEP } from '../process.js';

function replaceTail(plan, step, ...nextSteps) {
  plan.steps.splice(step, plan.steps.length - step, ...nextSteps);
}

function appendReplannedSteps(plan, step) {
  const planned = plan.steps[step - 1]?.output?.value;
  if (!Array.isArray(planned)) throw new Error('REPLAN output must contain an array of steps.');
  replaceTail(plan, step, ...planned);
}

export default {
  type: STEP.SEQUENCE,
  steps: [
    {
      type: STEP.WORKER,
      preset: 'code',
      input: {
        context: {
          parent: true,
        },
      },
    },
    {
      type: STEP.VALIDATE,
      input: {
        context: {
          parent: true,
          previous: true,
        },
      },
      transition: (plan, step) => {
        const result = plan.steps[step - 1]?.output;
        if (result?.status !== 'FAILURE') return;

        replaceTail(plan, step, {
          type: STEP.REPLAN,
          input: {
            context: {
              parent: true,
              previous: true,
            },
          },
          transition: appendReplannedSteps,
        });
      },
    },
  ],
};

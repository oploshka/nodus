import { STEP, TASK_TYPE } from '../process.js';

function replaceTail(plan, step, ...nextSteps) {
  plan.steps.splice(step, plan.steps.length - step, ...nextSteps);
}

function appendPlannedSteps(plan, step) {
  const planned = plan.steps[step - 1]?.output?.value;
  if (!Array.isArray(planned)) throw new Error('PLAN output must contain an array of steps.');
  replaceTail(plan, step, ...planned);
}

export default {
  type: STEP.SEQUENCE,
  steps: [
    {
      type: STEP.QUALIFY,
      input: {
        context: {
          parent: true,
        },
      },
      transition: (plan, step) => {
        const type = plan.steps[step - 1]?.output?.value;

        switch (type) {
          case TASK_TYPE.SIMPLE:
            replaceTail(plan, step, {
              type: STEP.WORKER,
              input: {
                context: {
                  parent: true,
                },
              },
            });
            return;

          case TASK_TYPE.MULTI:
          case TASK_TYPE.PROCESS:
            replaceTail(plan, step, {
              type: STEP.PLAN,
              input: {
                context: {
                  parent: true,
                  previous: true,
                },
              },
              transition: appendPlannedSteps,
            });
            return;

          default:
            throw new Error(`Unknown task type: ${String(type)}`);
        }
      },
    },
  ],
};

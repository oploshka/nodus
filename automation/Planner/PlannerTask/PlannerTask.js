import { TASK_TYPE } from '#automation/Qualifier/QualifierTask/QualifierTask.js';
import PlannerTaskResponse from './PlannerTaskResponse.js';

function replaceTail(plan, step, ...nextSteps) {
  plan.steps.splice(step, plan.steps.length - step, ...nextSteps);
}

export default {
  id: 'task',
  qualifier: 'task',
  schema: {
    type: 'SEQUENCE',
    steps: [
      {
        type: 'QUALIFY',
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
                type: 'WORKER',
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
                type: 'PLAN',
                input: {
                  context: {
                    parent: true,
                    previous: true,
                  },
                },
              });
              return;

            default:
              throw new Error(`Unknown task type: ${String(type)}`);
          }
        },
      },
    ],
  },
  plan: {
    prompt: new URL('./PlannerTaskPrompt.md', import.meta.url),
    response: PlannerTaskResponse,
  },
};

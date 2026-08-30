import { TASK_TYPE } from '../process.js';

export default {
  id: 'default',
  schema: 'planner',
  qualify: {
    prompt: 'qualifier',
    response: 'qualifier',
    options: Object.values(TASK_TYPE),
  },
  plan: {
    prompt: 'planner',
    response: 'planner',
  },
};

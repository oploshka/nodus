export default {
  id: 'default',
  prompt: 'planner',
  response: 'planner',
  schemas: [
    'code-change',
  ],
  classification: {
    options: ['schema', 'chain', 'custom'],
    allowCustom: false,
  },
};

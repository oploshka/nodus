export default {
  id: 'code',
  prompt: 'worker-code',
  actions: [
    'find-file',
    'read-file',
    'research',
    'change-code',
  ],
  response: 'change-code',
  limits: {
    attempts: 5,
    researchRequests: 2,
  },
};

import WorkerCodeResponse from './WorkerCodeResponse.js';

export default {
  id: 'code',
  prompt: new URL('./WorkerCodePrompt.md', import.meta.url),
  response: WorkerCodeResponse,
  actions: [
    'find-file',
    'read-file',
    'research',
    'change-code',
  ],
  limits: {
    attempts: 5,
    researchRequests: 2,
  },
};

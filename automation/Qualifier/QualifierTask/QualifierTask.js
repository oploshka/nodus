import QualifierTaskResponse from './QualifierTaskResponse.js';

export const TASK_TYPE = Object.freeze({
  SIMPLE: 'SIMPLE',
  MULTI: 'MULTI',
  PROCESS: 'PROCESS',
});

export default {
  id: 'task',
  prompt: new URL('./QualifierTaskPrompt.md', import.meta.url),
  response: QualifierTaskResponse,
  options: Object.values(TASK_TYPE),
};

export default {
  kind: 'sequence',
  id: 'code-change',
  variables: ['task', 'implementation', 'validation', 'replan'],
  steps: [
    {
      kind: 'action',
      id: 'implement',
      use: 'worker',
      preset: 'code',
      input: { task: 'task' },
      saveAs: 'implementation',
    },
    {
      kind: 'action',
      id: 'validate',
      use: 'validate',
      input: {
        task: 'task',
        changes: 'implementation.value',
      },
      saveAs: 'validation',
      onFailure: [
        {
          kind: 'action',
          id: 'replan',
          use: 'replan',
          input: {
            task: 'task',
            failure: 'validation',
          },
          saveAs: 'replan',
        },
      ],
    },
  ],
};

import type { ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';

export type tPlannerTaskDecompositionType =
  | 'coherent-outcome'
  | 'independent-outcome'
  | 'dependency'
  | 'separate-deliverable';

export interface sPlannerTaskResponse {
  steps: Array<{
    goal: string;
    constraints: string[];
    decompositionType: tPlannerTaskDecompositionType;
    knowledgeImpact?: string[];
  }>;
}

const PlannerTaskResponse: ModelResponseSchema = {
  description: 'A small semantic plan for the user task.',
  fields: {
    steps: {
      type: 'array',
      description: 'Ordered independently valuable outcomes. Default to one step.',
      items: {
        type: 'object',
        fields: {
          goal: {
            type: 'string',
            description: 'Complete user-valued outcome this step must achieve.',
          },
          constraints: {
            type: 'array',
            items: { type: 'string' },
            description: 'Explicit user constraints that define when this outcome is correctly completed. Use an empty array when none apply.',
          },
          decompositionType: {
            type: 'option',
            optionList: [
              {
                id: 'coherent-outcome',
                description: 'The request is one coherent outcome and no independent split is justified.',
              },
              {
                id: 'independent-outcome',
                description: 'This outcome remains complete and independently valuable if the other steps are never implemented.',
              },
              {
                id: 'dependency',
                description: 'The user explicitly requests a later independently valuable outcome that cannot reasonably be attempted before this one exists.',
              },
              {
                id: 'separate-deliverable',
                description: 'The user explicitly requests this result as a separately valuable deliverable.',
              },
            ],
            description: 'Why this independently valuable outcome is represented as its own step.',
          },
          knowledgeImpact: {
            type: 'array',
            items: { type: 'string' },
            optional: true,
            description: 'Knowledge that may become stale or change after this step.',
          },
        },
      },
    },
  },
};

export default PlannerTaskResponse;

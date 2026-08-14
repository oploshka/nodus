import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';
import { callModel } from '@model/Runner/ModelCaller.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';
import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';
import type { Task } from '@engine/Task/Task.js';
import type { Plan, PlanStepDecompositionType } from '@engine/Planner/Plan.js';
import type { Planner } from '@engine/Planner/Planner.js';
import { PlannerPresentation } from '@engine/Presentation/PlannerPresentation.js';
import { ModelLanguagePolicy } from '@engine/Language/ModelLanguagePolicy.js';

interface PlannerModelResponse {
  steps: Array<{
    goal: string;
    constraints: string[];
    decompositionType: PlanStepDecompositionType;
    knowledgeImpact?: string[];
  }>;
}

const plannerSchema: ModelResponseSchema = {
  description: 'A small semantic plan for the user task.',
  fields: {
    steps: {
      type: 'array',
      description: 'Ordered semantic work steps. Keep this list small.',
      items: {
        type: 'object',
        fields: {
          goal: { type: 'string', description: 'Outcome this step must achieve.' },
          constraints: {
            type: 'array',
            items: { type: 'string' },
            description: 'Explicit user constraints that define when this goal is correctly completed. Use an empty array when none apply.',
          },
          decompositionType: {
            type: 'option',
            optionList: [
              { id: 'coherent-outcome', description: 'The request is one coherent outcome and no split reason applies.' },
              { id: 'independent-outcome', description: 'This outcome can be completed and judged independently from the other requested outcomes.' },
              { id: 'dependency', description: 'A later requested outcome cannot reasonably be attempted before this outcome exists.' },
              { id: 'separate-deliverable', description: 'The user explicitly expects this result as a separately observable deliverable.' },
            ],
            description: 'Why this outcome is represented as this PlanStep. This describes decomposition only, never implementation type.',
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

export class ModelPlanner implements Planner {
  public readonly presentation = new PlannerPresentation();
  public constructor(
    private readonly model: ModelRunner,
    private readonly logger: EngineLogger,
    private readonly nodusLanguage = 'en',
    private readonly messageTemplate = '##message##',
  ) {}

  public async plan(task: Task): Promise<Plan> {
    const message = renderMessageTemplate(
      this.messageTemplate,
      'Split this user request into the smallest useful set of executable semantic tasks.',
    );
    const response = await callModel<PlannerModelResponse>(this.model, this.logger, {
      request: {
        message,
        data: task.description,
        format: ModelRequestFormat.Text,
        guidance: [
          'You are the high-level Planner inside Nodus.',
          'The user task may be in any language.',
          ModelLanguagePolicy.nodus(this.nodusLanguage),
          'Create only steps that directly contribute to the user-requested outcome.',
          'Do not invent analysis, documentation, safety limits, configuration semantics, or other requirements the user did not ask for.',
          'Do not add research/understand/discover steps merely because implementation details are unknown; the Worker resolves missing project knowledge while executing.',
          'Do NOT solve implementation details, discover APIs, name files unless the user named them, or prescribe patch mechanics.',
          'Each step must be something a Worker can try to complete, not a question or preparatory investigation.',
          'Decompose by user-visible semantic outcomes, never by files, architectural layers, implementation phases, research needs, validation phases, or technical sub-actions.',
          'Create a separate step only when at least one reason applies: (1) independent-outcome: the result can succeed/fail independently, (2) dependency: another requested result cannot reasonably be attempted before it exists, or (3) separate-deliverable: the user explicitly expects it as a separate observable deliverable.',
          'If none of those separation reasons apply, return exactly one coherent-outcome step.',
          'Treat wording such as preserve/default/do not/change only/pass through/update example as constraints of the coherent goal when they describe correctness of that same outcome; do not automatically turn each clause into its own step.',
          'Every step must include constraints. Copy only explicit user constraints that remain relevant to that goal; use an empty array when there are none.',
          'The decompositionType field explains why the step exists as a semantic planning unit. It is not a Worker type, Action type, file category, or implementation strategy.',
          'Preserve explicit user constraints and nothing more.',
        ].join('\n'),
      },
      response: { format: ModelResponseFormat.Json, schema: plannerSchema },
      settings: { maxTokens: 2048 },
    });

    return {
      steps: response.steps.slice(0, 8).map((step, index) => ({
        // Step identity belongs to Nodus runtime, not to the model response.
        id: `step-${index + 1}`,
        goal: step.goal,
        constraints: step.constraints,
        decompositionType: step.decompositionType,
        knowledgeImpact: step.knowledgeImpact,
      })),
    };
  }
}

function renderMessageTemplate(template: string, message: string): string {
  if (!template.includes('##message##')) {
    throw new Error('Planner message template must contain ##message## marker.');
  }
  return template.replaceAll('##message##', message);
}

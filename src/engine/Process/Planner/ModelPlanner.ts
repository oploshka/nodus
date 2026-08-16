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
      description: 'Ordered independently valuable outcomes. Default to one step.',
      items: {
        type: 'object',
        fields: {
          goal: { type: 'string', description: 'Complete user-valued outcome this step must achieve.' },
          constraints: {
            type: 'array',
            items: { type: 'string' },
            description: 'Explicit user constraints that define when this outcome is correctly completed. Use an empty array when none apply.',
          },
          decompositionType: {
            type: 'option',
            optionList: [
              { id: 'coherent-outcome', description: 'The request is one coherent outcome and no independent split is justified.' },
              { id: 'independent-outcome', description: 'This outcome remains complete and independently valuable if the other steps are never implemented.' },
              { id: 'dependency', description: 'The user explicitly requests a later independently valuable outcome that cannot reasonably be attempted before this one exists.' },
              { id: 'separate-deliverable', description: 'The user explicitly requests this result as a separately valuable deliverable.' },
            ],
            description: 'Why this independently valuable outcome is represented as its own PlanStep.',
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
      'Determine the independently valuable outcomes requested by the user and return the minimum number of PlanSteps needed to represent them.',
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
          'Default to exactly one PlanStep.',
          'Create more than one PlanStep only for outcomes that remain complete and independently valuable to the user if every other PlanStep is permanently abandoned.',
          'Dependencies, implementation layers, files, classes, methods, tests, validation cases, implementation phases, research needs, and supporting changes are not independent outcomes by themselves.',
          'Tests that verify requested behavior belong to the same outcome as the implementation unless the user explicitly requests testing as a separate deliverable.',
          'If one requested behavior requires coordinated changes across multiple project parts, keep all required changes in one PlanStep.',
          'Do not create another PlanStep merely because some work can technically be implemented separately or performed in sequence.',
          'Do not invent analysis, documentation, refactoring, cleanup, validation, configuration semantics, safety limits, or other work the user did not request.',
          'Do not add research/understand/discover steps merely because implementation details are unknown; the Worker resolves missing project knowledge while executing.',
          'Do not solve implementation details, discover APIs, name files unless the user named them, or prescribe patch mechanics.',
          'Each step must describe a complete outcome a Worker can try to deliver, not a question, preparatory investigation, technical sub-action, file layer, or test case.',
          'For every step after the first, apply this test: Would the user still consider this outcome complete and independently valuable if all other PlanSteps were permanently abandoned? If not, merge it into the same PlanStep.',
          'Every step must include constraints. Copy only explicit user constraints that remain relevant to that outcome; use an empty array when none apply.',
          'Use coherent-outcome when the request is represented by one PlanStep. Use another decompositionType only when that step passes the independent-value test above.',
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

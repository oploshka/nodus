import { scenario } from '@test/framework/Scenario.js';

export const maxPlanStepsScenario = scenario({
  id: 'max-plan-steps',
  task: 'Make Planner maxPlanSteps configurable through runtime.maxPlanSteps, preserve the default value 8 in Planner, pass the value through Bootstrap, and update nodus.config.example.json.',
  files: {
    'src/engine/Planner/ModelPlanner.ts': [
      'export class ModelPlanner {',
      '  public constructor(private readonly model: unknown) {}',
      '',
      '  public plan(steps: string[]): string[] {',
      '    return steps.slice(0, 8);',
      '  }',
      '}',
      '',
    ].join('\n'),
    'src/app/Bootstrap.ts': [
      "import { ModelPlanner } from '../engine/Planner/ModelPlanner.js';",
      '',
      'export function createPlanner(model: unknown, configuration: any): ModelPlanner {',
      '  return new ModelPlanner(model);',
      '}',
      '',
    ].join('\n'),
    'nodus.config.example.json': JSON.stringify({ runtime: { maxWorkerAttempts: 4 } }, null, 2) + '\n',
  },
  runtime: { maxWorkerAttempts: 3, maxResearchRequests: 2 },
  modelResponses: [
    JSON.stringify({
      steps: [{
        goal: 'Make Planner maxPlanSteps configurable through runtime.maxPlanSteps, preserve default 8, pass it through Bootstrap, and update the example config.',
        constraints: [],
        decompositionType: 'coherent-outcome',
      }],
    }),
    JSON.stringify({ optionId: 'code' }),
    JSON.stringify({
      outcome: 'missing-information',
      questions: [
        'Where is the current maxPlanSteps limit defined in ModelPlanner?',
        'How does Bootstrap instantiate ModelPlanner and pass runtime configuration?',
      ],
    }),
    'ModelPlanner currently hardcodes the limit with steps.slice(0, 8).',
    'Bootstrap constructs ModelPlanner with new ModelPlanner(model) and receives configuration in createPlanner.',
    JSON.stringify({
      outcome: 'ready',
      summary: 'maxPlanSteps is configurable with default 8.',
      edits: [
        {
          path: 'src/engine/Planner/ModelPlanner.ts',
          instruction: 'Add an optional maxPlanSteps constructor parameter defaulting to 8 and use it instead of the hardcoded slice limit.',
        },
        {
          path: 'src/app/Bootstrap.ts',
          instruction: 'Pass configuration.runtime?.maxPlanSteps to ModelPlanner.',
        },
        {
          path: 'nodus.config.example.json',
          instruction: 'Add runtime.maxPlanSteps with value 8 without changing other runtime fields.',
        },
      ],
    }),
    JSON.stringify({
      path: 'src/engine/Planner/ModelPlanner.ts',
      operations: [
        {
          line: 2,
          before: '  public constructor(private readonly model: unknown) {}',
          after: [
            '  public constructor(',
            '    private readonly model: unknown,',
            '    private readonly maxPlanSteps = 8,',
            '  ) {}',
          ].join('\n'),
        },
        {
          line: 5,
          before: '    return steps.slice(0, 8);',
          after: '    return steps.slice(0, this.maxPlanSteps);',
        },
      ],
    }),
    JSON.stringify({
      path: 'src/app/Bootstrap.ts',
      operations: [{
        line: 4,
        before: '  return new ModelPlanner(model);',
        after: '  return new ModelPlanner(model, configuration.runtime?.maxPlanSteps);',
      }],
    }),
    JSON.stringify({
      path: 'nodus.config.example.json',
      operations: [{
        line: 3,
        before: '    \"maxWorkerAttempts\": 4',
        after: ['    \"maxWorkerAttempts\": 4,', '    \"maxPlanSteps\": 8'].join('\n'),
      }],
    }),
  ],
});

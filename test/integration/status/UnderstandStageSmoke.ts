// UnderstandStageSmoke.ts
import { runStepHarness } from '../../support/StepHarness';
import { STATUS_SEARCH_FACTS, STATUS_CLI_SOURCE, STATUS_INTEGRATION_FACTS } from './StatusCommandScenario';

const projectSessionSource = `// ProjectSession.ts\nexport class ProjectSession {\n  public index?: ProjectIndex;\n  public get projectId(): string { return this.configuration.id; }\n}\n`;

const result = await runStepHarness({
  step: {
    id: 'status-understand-stage',
    type: 'understand',
    action: 'determine-integration',
    subject: 'establish /status CLI access facts from located evidence and Cli.ts',
    goal: 'Определить интеграцию команды /status',
    status: 'pending',
    maxAttempts: 1,
    inputs: STATUS_SEARCH_FACTS.map((fact) => fact.key),
    outputs: STATUS_INTEGRATION_FACTS.map((fact) => fact.key),
  },
  seedFacts: STATUS_SEARCH_FACTS.map((fact) => ({ ...fact, evidence: [...fact.evidence] })),
  model: (input, call) => {
    if (input.activeStep?.attempt !== 1) {
      throw new Error(`All read continuations must stay inside semantic attempt 1, got ${input.activeStep?.attempt}`);
    }

    const toolContext = input.execution.getToolContext();
    if (call === 1) {
      return {
        status: 'continue',
        message: 'Need Cli.ts source.',
        toolCalls: [{ tool: 'file-system', input: { action: 'read', path: 'src/cli/Cli.ts' } }],
        changes: [],
        observations: [],
        stepResult: { goalSatisfied: false, findings: [], evidence: [], missing: ['src/cli/Cli.ts source'], facts: [] },
      };
    }

    if (call === 2) {
      if (!toolContext.some((entry) => entry.call.input.path === 'src/cli/Cli.ts' && String(entry.result.data).includes('COMMANDS'))) {
        throw new Error('Second understand call must receive Cli.ts source');
      }
      input.execution.consumeToolContext();
      return {
        status: 'continue',
        message: 'Need ProjectSession.ts source to confirm CLI project/index access.',
        toolCalls: [{ tool: 'file-system', input: { action: 'read', path: 'src/project/ProjectSession/ProjectSession.ts' } }],
        changes: [],
        observations: [],
        stepResult: {
          goalSatisfied: false,
          findings: ['Cli.ts uses COMMANDS plus inline command branches.'],
          evidence: [{ path: 'src/cli/Cli.ts', symbol: 'runCli', fact: 'COMMANDS + inline handlers.' }],
          missing: ['ProjectSession.ts source'],
          facts: [],
        },
      };
    }

    const paths = toolContext.map((entry) => String(entry.call.input.path));
    if (!paths.includes('src/cli/Cli.ts') || !paths.includes('src/project/ProjectSession/ProjectSession.ts')) {
      throw new Error(`Understand transient source cache must retain both reads, got ${paths.join(', ')}`);
    }
    input.execution.consumeToolContext();
    return {
      status: 'completed',
      message: 'Integration facts established.',
      toolCalls: [],
      changes: [],
      observations: [],
      stepResult: {
        goalSatisfied: true,
        findings: ['All four /status integration facts are established.'],
        evidence: STATUS_INTEGRATION_FACTS.flatMap((fact) => fact.evidence.map((item) => ({ ...item }))),
        missing: [],
        facts: STATUS_INTEGRATION_FACTS.map((fact) => ({ ...fact, evidence: [...fact.evidence] })),
      },
    };
  },
  tool: (calls, execution) => {
    execution.setToolContext(calls.map((call) => {
      const path = String(call.input.path ?? '');
      const data = path.endsWith('Cli.ts') ? STATUS_CLI_SOURCE : projectSessionSource;
      return { call, result: { ok: true, data } };
    }), 1);
    return calls.length;
  },
});

if (result.modelCalls !== 3) throw new Error(`Expected understand -> read -> understand -> read -> understand, got ${result.modelCalls} model calls`);
if (result.toolCalls !== 2) throw new Error(`Expected exactly two source reads, got ${result.toolCalls}`);
if (result.recoveryCalls !== 0) throw new Error('Tool continuations inside one understand attempt must not trigger recovery');
for (const fact of STATUS_INTEGRATION_FACTS) {
  if (!result.state.executionContext.has(fact.key)) throw new Error(`Understand did not produce ${fact.key}`);
}
if (result.state.plan.steps[0]?.status !== 'completed') throw new Error('Understand step did not complete');

console.log('## /status understand stage');
console.log('evidence is transformed into scoped semantic facts: OK');
console.log('multiple reads stay inside one semantic attempt: OK');
console.log('fact provenance survives the transform: OK');
console.log('PASS');

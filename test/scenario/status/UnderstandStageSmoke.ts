// UnderstandStageSmoke.ts
import { runStepHarness } from '../../Support/StepHarness';
import { STATUS_SEARCH_FACTS, STATUS_CLI_SOURCE } from './StatusCommandScenario';

const projectSessionSource = `// ProjectSession.ts\nexport class ProjectSession {\n  public index?: ProjectIndex;\n  public get projectId(): string { return this.configuration.id; }\n}\n`;

const result = await runStepHarness({
  step: {
    id: 'status-understand-stage',
    type: 'understand',
    action: 'determine-integration',
    subject: '/status in runCli using known project/conversation/index sources',
    goal: 'Определить интеграцию команды /status',
    status: 'pending',
    maxAttempts: 1,
    inputs: STATUS_SEARCH_FACTS.map((fact) => fact.key),
    outputs: ['cli.status.integration'],
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
        message: 'Need ProjectSession.ts source to confirm exposed accessors.',
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
      message: 'Integration understood.',
      toolCalls: [],
      changes: [],
      observations: [],
      stepResult: {
        goalSatisfied: true,
        findings: ['Add /status to COMMANDS and one inline runCli branch using existing access paths.'],
        evidence: [
          { path: 'src/cli/Cli.ts', symbol: 'runCli', fact: 'Commands use COMMANDS + inline handlers.' },
          { path: 'src/project/ProjectSession/ProjectSession.ts', symbol: 'projectId', fact: 'ProjectSession exposes projectId and optional index.' },
        ],
        missing: [],
        facts: [{
          key: 'cli.status.integration',
          value: 'COMMANDS entry + inline runCli handler; read projectSession.projectId, conversation.id, projectSession.index?.files.length.',
          evidence: [],
        }],
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
if (!result.state.executionContext.has('cli.status.integration')) throw new Error('Understand output was not stored');
if (result.state.plan.steps[0]?.status !== 'completed') throw new Error('Understand step did not complete');

console.log('## /status understand stage');
console.log('maxAttempts=1 still allows internal read continuations: OK');
console.log('two source reads happen once inside one semantic attempt: OK');
console.log('transient source cache survives until understand completes: OK');
console.log('PASS');

import { PlanCompiler } from '@planner/PlanCompiler';
import { STATUS_SCENARIO_REQUIREMENTS, STATUS_SCENARIO_TASK } from '@planner/Scenario/StatusScenario';
import { StepRegistry } from '@planner/StepRegistry';
import type { ModelScenarioSchema, ScenarioSeedFact } from '@test/model/support/ScenarioSchema';

const plan = new PlanCompiler(new StepRegistry()).compile(STATUS_SCENARIO_REQUIREMENTS, 'ru');

const evidence: ScenarioSeedFact[] = [
  { key: 'evidence:project.id.definition', value: 'src/project/ProjectSession/ProjectSession.ts#projectId: public get projectId(): string', evidence: [{ path: 'src/project/ProjectSession/ProjectSession.ts', symbol: 'projectId', fact: 'ProjectSession exposes projectId.' }] },
  { key: 'evidence:conversation.id.definition', value: 'src/core/Conversation/Conversation.ts#id: public readonly id: string', evidence: [{ path: 'src/core/Conversation/Conversation.ts', symbol: 'id', fact: 'Conversation exposes readonly id.' }] },
  { key: 'evidence:project.index.files', value: 'src/project/Index/ProjectIndex.ts#files: files: ProjectFileFact[]', evidence: [{ path: 'src/project/Index/ProjectIndex.ts', symbol: 'files', fact: 'ProjectIndex exposes files.' }] },
  { key: 'evidence:project.index.currentAccess', value: 'src/project/ProjectSession/ProjectSession.ts#index: public index?: ProjectIndex', evidence: [{ path: 'src/project/ProjectSession/ProjectSession.ts', symbol: 'index', fact: 'ProjectSession exposes the already available current index as optional state.' }] },
];

const runtimeFacts: ScenarioSeedFact[] = [
  { key: 'fact:project.id.access@cli', value: 'Use configuration.project.id from the CLI runtime context.', evidence: [{ path: 'src/cli/Cli.ts', symbol: 'runCli', fact: 'CLI already has configuration in runCli.' }] },
  { key: 'fact:conversation.id.access@cli', value: 'Use conversation.id from the active CLI conversation.', evidence: [{ path: 'src/cli/Cli.ts', symbol: 'runCli', fact: 'CLI keeps the active conversation in the conversation variable.' }] },
  { key: 'fact:projectSession.access@cli', value: 'Use nodus.projectSession from the Nodus instance already available in runCli.', evidence: [{ path: 'src/cli/Cli.ts', symbol: 'runCli', fact: 'CLI has the nodus runtime receiver.' }] },
  { key: 'fact:cli.command.pattern@cli', value: 'Register /status in COMMANDS and dispatch it with an inline value === /status branch in runCli.', evidence: [{ path: 'src/cli/Cli.ts', symbol: 'runCli', fact: 'CLI uses COMMANDS plus inline command branches.' }] },
];
const indexFact: ScenarioSeedFact = {
  key: 'fact:project.index.fileCount.access@cli',
  value: 'Use nodus.projectSession.index?.files.length. Read existing optional index state only; do not call scan or refresh.',
  evidence: [{ path: 'src/project/ProjectSession/ProjectSession.ts', symbol: 'index', fact: 'ProjectSession exposes optional existing index state.' }, { path: 'src/project/Index/ProjectIndex.ts', symbol: 'files', fact: 'ProjectIndex exposes files.' }],
};
const integrationFacts = [...runtimeFacts, indexFact];

const changeDefinition: ScenarioSeedFact = {
  key: 'change-definition:status.command',
  value: ['Target: src/cli/Cli.ts', 'Intent: minimal /status command implementation using the established CLI access facts and command pattern', 'Established facts:', ...integrationFacts.map((fact) => `- ${fact.key} = ${fact.value}`), 'Constraints:', '- minimal-change', '- reuse-existing-api', '- no-unrelated-changes', '- no-side-effects-for-status-read'].join('\n'),
  evidence: integrationFacts.flatMap((fact) => fact.evidence ?? []),
};

export const statusModelScenario: ModelScenarioSchema = {
  id: 'status-command', task: STATUS_SCENARIO_TASK, plan,
  inputsBeforeStep: {
    1: [], 2: [], 3: [], 4: [],
    5: evidence,
    6: [...evidence.filter((fact) => fact.key.includes('project.index')), ...runtimeFacts.filter((fact) => fact.key === 'fact:projectSession.access@cli')],
    7: integrationFacts,
    8: [changeDefinition],
    9: [{ key: 'change-result:status.command', value: 'Validated and applied requested edit to src/cli/Cli.ts', evidence: [{ path: 'src/cli/Cli.ts', fact: 'Status command edit applied.' }] }],
  },
  expectations: {
    1: { step: 1, type: 'search', expectedOutputs: ['evidence:project.id.definition'], expectedRetrieval: 'exact', expectModelCalls: 'none', expectToolCalls: 'some' },
    2: { step: 2, type: 'search', expectedOutputs: ['evidence:conversation.id.definition'], expectedRetrieval: 'exact', expectModelCalls: 'none', expectToolCalls: 'some' },
    3: { step: 3, type: 'search', expectedOutputs: ['evidence:project.index.files'], expectedRetrieval: 'exact', expectModelCalls: 'none', expectToolCalls: 'some' },
    4: { step: 4, type: 'search', expectedOutputs: ['evidence:project.index.currentAccess'], expectedRetrieval: 'exact', expectedValueIncludes: { 'evidence:project.index.currentAccess': ['ProjectSession', 'index'] }, forbiddenValueIncludes: { 'evidence:project.index.currentAccess': ['scan()', 'refresh()'] }, expectModelCalls: 'none', expectToolCalls: 'some' },
    5: { step: 5, type: 'understand', expectedOutputs: runtimeFacts.map((fact) => fact.key), expectedContextKeys: runtimeFacts.map((fact) => fact.key), expectModelCalls: 'some' },
    6: { step: 6, type: 'understand', expectedOutputs: [indexFact.key], expectedContextKeys: [indexFact.key], expectedValueIncludes: { [indexFact.key]: ['nodus.projectSession.index?.files.length'] }, forbiddenValueIncludes: { [indexFact.key]: ['scan()', 'refresh()', 'getIndex()'] }, forbiddenMissingIncludes: [indexFact.key], expectModelCalls: 'some' },
    7: { step: 7, type: 'prepare-change', expectedOutputs: ['change-definition:status.command'], expectedValueIncludes: { 'change-definition:status.command': ['src/cli/Cli.ts', 'fact:project.index.fileCount.access@cli', 'no-side-effects-for-status-read'] }, forbiddenValueIncludes: { 'change-definition:status.command': ['scan()', 'refresh()', 'getIndex()'] }, expectModelCalls: 'none' },
    8: { step: 8, type: 'edit-file', expectedOutputs: ['change-result:status.command'], expectedChangePaths: ['src/cli/Cli.ts'], changeContentIncludes: ['/status', 'projectSession.index', 'conversation.id'], changeContentForbids: ['projectSession.scan(', 'projectSession.refresh(', 'getIndex('], expectModelCalls: 'some' },
    9: { step: 9, type: 'finalize', expectedOutputs: ['final-result:status.command'], expectModelCalls: 'none' },
  },
};

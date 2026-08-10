// SearchRequestCompilerSmoke.ts
import { SearchRequestCompiler } from '@agent/Planning/SearchRequestCompiler';
import type { PlanStep } from '@agent/Planning/TaskPlan';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function searchStep(output: string, sourceHint: string): PlanStep {
  return {
    id: 'step-search',
    type: 'search',
    action: 'find-definitions',
    subject: output,
    goal: output,
    status: 'pending',
    maxAttempts: 1,
    inputs: [],
    outputs: [output],
    sourceHints: [sourceHint],
  };
}

console.log('## search request compiler smoke');

const compiler = new SearchRequestCompiler();
const projectCalls = compiler.compile(searchStep(
  'evidence:project.id.definition',
  'src/project/ProjectSession/ProjectSession.ts',
));
assert(projectCalls.length > 0, 'project ID retrieval was not compiled');
assert(projectCalls.every((call) => call.tool === 'search'), 'definition retrieval should compile to search tool calls');
assert(projectCalls.every((call) => call.input.path === 'src/project/ProjectSession/ProjectSession.ts'), 'source hint was not enforced as retrieval scope');
assert(projectCalls.some((call) => call.input.query === 'projectId'), 'typed evidence key did not derive projectId query');
console.log('typed evidence + source hint compiles to canonical search calls: OK');

const conversationCalls = compiler.compile(searchStep(
  'evidence:conversation.id.definition',
  'src/core/Conversation/Conversation.ts',
));
assert(conversationCalls.some((call) => call.input.query === 'id'), 'conversation ID fallback query was not derived');
console.log('compiler derives narrow fallback terms without model tool syntax: OK');

const modelQueries = compiler.queriesFromModelData({ queries: ['readonly id', 'id'] });
assert(modelQueries.join(',') === 'readonly id,id', 'model query payload was not parsed');
const compiledModelQueries = compiler.compile(searchStep(
  'evidence:conversation.id.definition',
  'src/core/Conversation/Conversation.ts',
), modelQueries);
assert(compiledModelQueries[0]?.input.query === 'readonly id', 'model lexical query should be preferred but runtime must own the tool call');
console.log('model may refine lexical terms while Nodus owns raw tool calls: OK');
console.log('PASS');

// SearchRequestCompilerSmoke.ts
import { SearchRequestCompiler } from '@research/Resolver/SearchRequestCompiler';
import type { PlanStep } from '@planner/TaskPlan';

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
const project = compiler.compile(searchStep(
  'evidence:project.id.definition',
  'src/project/ProjectSession/ProjectSession.ts',
));
assert(project.exact.length > 0, 'project ID exact retrieval was not compiled');
assert(project.exact.every((call) => call.tool === 'search'), 'definition retrieval should compile to search tool calls');
assert(project.exact.every((call) => call.input.path === 'src/project/ProjectSession/ProjectSession.ts'), 'source hint was not enforced as retrieval scope');
assert(project.exact.some((call) => call.input.query === 'projectId'), 'typed evidence key did not derive projectId query');
console.log('typed evidence + source hint compiles exact canonical search calls: OK');

const conversation = compiler.compile(searchStep(
  'evidence:conversation.id.definition',
  'src/core/Conversation/Conversation.ts',
));
assert(conversation.exact.some((call) => call.input.query === 'id'), 'conversation ID exact query was not derived');
console.log('compiler derives narrow exact terms without model tool syntax: OK');

const currentIndex = compiler.compile(searchStep(
  'evidence:project.index.currentAccess',
  'src/project/ProjectSession/ProjectSession.ts',
));
assert(currentIndex.exact.some((call) => call.input.query === 'index'), 'camelCase semantic suffix should reduce to the concrete index identifier');
console.log('semantic suffixes reduce to concrete identifier queries: OK');

const modelQueries = compiler.queriesFromModelData({ queries: ['readonly id', 'id'] });
assert(modelQueries.join(',') === 'readonly id,id', 'model query payload was not parsed');
const refined = compiler.compile(searchStep(
  'evidence:conversation.id.definition',
  'src/core/Conversation/Conversation.ts',
), modelQueries);
assert(refined.exact[0]?.input.query === 'readonly id', 'model lexical query should be preferred while runtime owns the tool call');
console.log('model may refine lexical terms while Nodus owns raw tool calls: OK');

assert(refined.related.every((call) => !refined.exactQueries.includes(String(call.input.query))), 'related tier must not duplicate exact queries');
console.log('exact and related retrieval tiers stay separate: OK');
console.log('PASS');

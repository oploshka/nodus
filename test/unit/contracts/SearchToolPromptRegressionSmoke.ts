// SearchToolPromptRegressionSmoke.ts
import { toolDefinitionsMessage, toolDescriptionsMessage } from '@model/Prompt/ModelInputComposer';
import { DEFAULT_OPERATION_PROFILES } from '@operation/Default/DefaultOperationProfile';
import { FileSystemTool } from '@tool/FileSystem/FileSystemTool';
import { SearchTool } from '@tool/Search/SearchTool';

console.log('## retrieval prompt/tool contract regression smoke');

const searchProfile = DEFAULT_OPERATION_PROFILES.find((profile) => profile.id === 'search');
if (!searchProfile?.prompt.returnFormat?.includes('data')) throw new Error('search query protocol missing data payload');
if (searchProfile.prompt.returnFormat.includes('\"toolCalls\":')) throw new Error('search must not ask the model for raw tool calls');
console.log('search model returns lexical queries, not raw tool calls: OK');

const tools = [new SearchTool().definition, new FileSystemTool().definition];
const searchBlock = toolDescriptionsMessage(tools);
if (!searchBlock) throw new Error('search tool block missing');
if (!searchBlock.content.includes('- search:')) throw new Error('search tool description missing');
if (!searchBlock.content.includes('- file-system:')) throw new Error('file-system tool description missing');
if (searchBlock.content.includes('Input fields')) throw new Error('search prompt shape regressed to detailed schemas');
console.log('compact tool-description helper remains available for other operations: OK');

const understandBlock = toolDefinitionsMessage([new FileSystemTool().definition]);
if (!understandBlock?.content.includes('action: read | write | list | delete | exists')) {
  throw new Error('understand lost exact file-system action contract');
}
console.log('understand still sees exact file-system action contract: OK');
console.log('PASS');

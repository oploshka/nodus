// SearchToolPromptRegressionSmoke.ts
import { toolDefinitionsMessage, toolDescriptionsMessage } from '@model/Prompt/ModelInputComposer';
import { FileSystemTool } from '@tool/FileSystem/FileSystemTool';
import { SearchTool } from '@tool/Search/SearchTool';

console.log('## search tool prompt regression smoke');

const tools = [new SearchTool().definition, new FileSystemTool().definition];
const searchBlock = toolDescriptionsMessage(tools);
if (!searchBlock) throw new Error('search tool block missing');
if (!searchBlock.content.includes('- search:')) throw new Error('search tool description missing');
if (!searchBlock.content.includes('- file-system:')) throw new Error('file-system tool description missing');
if (searchBlock.content.includes('Input fields')) throw new Error('search prompt shape regressed to detailed schemas');
console.log('search keeps compact pre-regression tool prompt: OK');

const understandBlock = toolDefinitionsMessage([new FileSystemTool().definition]);
if (!understandBlock?.content.includes('action: read | write | list | delete | exists')) {
  throw new Error('understand lost exact file-system action contract');
}
console.log('understand still sees exact file-system action contract: OK');
console.log('PASS');

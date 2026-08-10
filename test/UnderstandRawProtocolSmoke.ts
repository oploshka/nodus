// UnderstandRawProtocolSmoke.ts
import { UnderstandRawProtocol } from '@model/Protocol/UnderstandRawProtocol';

const protocol = new UnderstandRawProtocol();

const readResult = protocol.parse(`STATUS continue
ACTION read
PATH src/cli/Cli.ts
MESSAGE Need CLI source.
GOAL false
MISSING fact:cli.command.pattern@cli`, ['fact:cli.command.pattern@cli']);

if (readResult.status !== 'continue') throw new Error('Expected continue status');
if (readResult.toolCalls.length !== 1) throw new Error(`Expected one compiled read, got ${readResult.toolCalls.length}`);
if (readResult.toolCalls[0]?.tool !== 'file-system') throw new Error('Expected file-system read');
if (readResult.toolCalls[0]?.input.action !== 'read') throw new Error('RAW PATH did not compile to canonical action=read');
if (readResult.toolCalls[0]?.input.path !== 'src/cli/Cli.ts') throw new Error('RAW PATH mismatch');
console.log('existing STATUS/ACTION/PATH raw style compiles to canonical file-system read: OK');

const completed = protocol.parse(`\`\`\`text
STATUS completed
GOAL true
MESSAGE Understanding complete
FINDING CLI access paths established.
EVIDENCE src/cli/Cli.ts#configuration.project.id Project ID is read directly from \`configuration.project.id\`; expression \`${'${configuration.project.id}'}\` requires no JSON escaping.
FACT fact:project.id.access@cli Use \`configuration.project.id\` from the loaded CLI configuration.
FACT fact:cli.command.pattern@cli Commands are registered in COMMANDS and dispatched by explicit if branches.
\`\`\``, ['fact:project.id.access@cli', 'fact:cli.command.pattern@cli']);

if (completed.status !== 'completed') throw new Error('Expected completed status');
if (!completed.stepResult?.goalSatisfied) throw new Error('Expected satisfied semantic result');
if (completed.stepResult.facts.length !== 2) throw new Error(`Expected two facts, got ${completed.stepResult.facts.length}`);
if (!completed.stepResult.evidence[0]?.fact.includes('${configuration.project.id}')) {
  throw new Error('RAW evidence lost template-expression text');
}
console.log('RAW facts/evidence preserve quotes, backticks and template expressions without JSON escaping: OK');

let rejected = false;
try {
  protocol.parse(`STATUS completed
GOAL true
FACT fact:not-declared value`, ['fact:declared']);
} catch {
  rejected = true;
}
if (!rejected) throw new Error('Undeclared FACT key must be rejected by schema validation');
console.log('FACT keys are validated against activeStep.outputs: OK');
console.log('PASS');

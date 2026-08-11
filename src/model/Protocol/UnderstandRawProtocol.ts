// UnderstandRawProtocol.ts
import type { OperationResult, StepEvidenceItem, StepResult, ToolCallRequest } from '@model/Result/OperationResult';

const STATUSES = new Set<OperationResult['status']>(['continue', 'waiting', 'completed', 'failed']);

export class UnderstandRawProtocol {
  public instructions(): string {
    return `Understand response protocol (NOT JSON):

To request source reads:
STATUS continue
ACTION read
PATH <relative/project/file.ts>
PATH <optional second file>
PATH <optional third file>
MESSAGE <optional short note>
GOAL false
MISSING <optional exact missing output or evidence>

For a completed semantic result:
STATUS completed
GOAL true|false
MESSAGE <optional short note>
FINDING <one-line finding>
EVIDENCE <relative/path.ts>#<optionalSymbol> <one-line fact supported by that source>
FACT <exact activeStep.outputs key> <one-line reusable fact value>
MISSING <one-line unresolved output or evidence>

FINDING, EVIDENCE, FACT, and MISSING may repeat. FACT keys must use EXACTLY activeStep.outputs keys.
For STATUS continue with ACTION read, PATH may repeat up to 3 times. Nodus converts PATH entries to canonical file-system reads; do not emit TOOL/INPUT JSON.
For STATUS waiting use QUESTION <question>. For STATUS failed use MESSAGE <reason>.
Do not wrap the response in markdown. Keep FACT/FINDING/EVIDENCE/MISSING values compact and on one line; raw code punctuation, quotes, backticks, and template expressions need no escaping.`;
  }

  public parse(content: string, expectedOutputs: string[] = []): OperationResult {
    const normalized = this.stripSingleFence(content.replace(/\r\n/g, '\n')).trim();
    const status = this.line(normalized, 'STATUS') as OperationResult['status'] | undefined;
    if (!status || !STATUSES.has(status)) throw new Error(`Invalid understand STATUS: ${String(status)}`);

    const message = this.line(normalized, 'MESSAGE');

    if (status === 'waiting') {
      const question = this.line(normalized, 'QUESTION');
      if (!question) throw new Error('understand waiting response requires QUESTION');
      return { ...this.base(status, message, [], undefined), question };
    }

    if (status === 'failed') {
      return this.base(status, message ?? 'understand failed', [], this.parseStepResult(normalized, expectedOutputs));
    }

    if (status === 'continue') {
      const action = (this.line(normalized, 'ACTION') ?? '').toLowerCase();
      const paths = this.lines(normalized, 'PATH');
      if (paths.length > 0) {
        if (action !== 'read') throw new Error('understand PATH entries require ACTION read');
        if (paths.length > 3) throw new Error(`Understand RAW response requested ${paths.length} reads; maximum is 3`);
        const toolCalls = paths.map<ToolCallRequest>((path) => {
          this.validateRelativePath(path, 'PATH');
          return { tool: 'file-system', input: { action: 'read', path } };
        });
        return this.base(status, message, toolCalls, this.parseStepResult(normalized, expectedOutputs));
      }
    }

    const stepResult = this.parseStepResult(normalized, expectedOutputs);
    if (status === 'completed' && !stepResult) {
      throw new Error('Understand RAW completed response requires GOAL/FACT/FINDING/EVIDENCE/MISSING data');
    }

    return this.base(status, message, [], stepResult);
  }

  private parseStepResult(content: string, expectedOutputs: string[]): StepResult | undefined {
    const goalValue = this.line(content, 'GOAL')?.toLowerCase();
    const findings = this.lines(content, 'FINDING').slice(0, 8);
    const missing = this.lines(content, 'MISSING').slice(0, 8);
    const evidence = this.lines(content, 'EVIDENCE')
      .map((entry) => this.parseEvidence(entry))
      .slice(0, 12);

    const allowedOutputs = new Set(expectedOutputs);
    const facts = this.lines(content, 'FACT')
      .map((entry) => {
        const parsed = entry.match(/^(\S+)\s+(.+)$/);
        if (!parsed) throw new Error(`Invalid understand FACT line: ${entry}`);
        const key = parsed[1];
        const value = parsed[2].trim();
        if (allowedOutputs.size > 0 && !allowedOutputs.has(key)) {
          throw new Error(`Understand RAW FACT key is not an activeStep output: ${key}`);
        }
        return { key, value, evidence: [] };
      })
      .slice(0, 12);

    const hasSemanticData = goalValue !== undefined || findings.length > 0 || missing.length > 0 || evidence.length > 0 || facts.length > 0;
    if (!hasSemanticData) return undefined;

    if (goalValue !== undefined && goalValue !== 'true' && goalValue !== 'false') {
      throw new Error(`Invalid understand GOAL value: ${goalValue || '<empty>'}`);
    }

    const missingOutput = expectedOutputs.some((output) => missing.some((item) => item.includes(output)));
    const allOutputsPublished = expectedOutputs.length === 0 || expectedOutputs.every((output) => facts.some((fact) => fact.key === output));

    return {
      goalSatisfied: goalValue === 'true' && !missingOutput && allOutputsPublished,
      findings,
      evidence,
      missing,
      facts,
    };
  }

  private parseEvidence(entry: string): StepEvidenceItem {
    const parsed = entry.match(/^(\S+)\s+(.+)$/);
    if (!parsed) throw new Error(`Invalid understand EVIDENCE line: ${entry}`);
    const location = parsed[1];
    const fact = parsed[2].trim();
    const [path, ...symbolParts] = location.split('#');
    this.validateRelativePath(path, 'EVIDENCE');
    return {
      path,
      symbol: symbolParts.length > 0 ? symbolParts.join('#').trim() || undefined : undefined,
      fact,
    };
  }

  private line(content: string, name: string): string | undefined {
    const match = content.match(new RegExp(`^${name}\\s+(.+)$`, 'mi'));
    return match?.[1]?.trim();
  }

  private lines(content: string, name: string): string[] {
    const expression = new RegExp(`^${name}\\s+(.+)$`, 'gmi');
    return [...content.matchAll(expression)]
      .map((match) => match[1]?.trim())
      .filter((value): value is string => Boolean(value));
  }

  private validateRelativePath(path: string, field: string): void {
    const normalized = path.trim().replace(/\\/g, '/');
    if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized) || normalized.split('/').includes('..')) {
      throw new Error(`Understand RAW ${field} path must be project-relative: ${path}`);
    }
  }

  private stripSingleFence(content: string): string {
    const opening = content.match(/^```[^\n]*\n/);
    if (!opening) return content;
    let withoutOpening = content.slice(opening[0].length);
    const closing = withoutOpening.match(/\n```\s*$/);
    if (closing) withoutOpening = withoutOpening.slice(0, closing.index);
    return withoutOpening;
  }

  private base(
    status: OperationResult['status'],
    message: string | undefined,
    toolCalls: ToolCallRequest[],
    stepResult: StepResult | undefined,
  ): OperationResult {
    return {
      status,
      message,
      toolCalls,
      changes: [],
      observations: [],
      stepResult,
    };
  }
}

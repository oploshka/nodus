import type { ChangeExecutionContext } from '@execution/ChangeExecutionContext';
import type { FileChange } from '@execution/State/ChangeSet';
import type { ChangeState, PreparedFileChange } from '@execution/State/ChangeState';
import type { Worker } from '@execution/Worker/Worker';

export class ChangeValidationWorker implements Worker<ChangeState, ChangeExecutionContext> {
  public readonly id = 'change-validation';

  public async execute(state: ChangeState, _context: ChangeExecutionContext): Promise<ChangeState> {
    const changes = state.proposal ?? [];
    const prepared = state.prepared ?? [];
    this.validate(state.work.changeDefinition, changes, prepared);
    return { ...state, phase: 'validated' };
  }

  public validate(changeDefinition: string | undefined, changes: FileChange[], prepared: PreparedFileChange[]): void {
    if (!changeDefinition) return;
    const target = this.lineValue(changeDefinition, 'Target:');
    if (target && (changes.length !== 1 || changes[0]?.path !== target)) {
      throw new Error(`Prepared change must modify exactly ${target}`);
    }

    const candidate = prepared.find((item) => !target || item.path === target);
    if (!candidate || candidate.change.type === 'delete' || candidate.resultingContent === undefined) {
      throw new Error('Prepared change contract requires a resulting source file');
    }

    const normalized = candidate.resultingContent.replace(/\r\n/g, '\n');
    const added = this.addedText(candidate.change);
    const intent = this.lineValue(changeDefinition, 'Intent:') ?? '';
    const commands = Array.from(new Set((intent.match(/\/[a-z][a-z0-9_-]*/gi) ?? [])));
    for (const command of commands) {
      const occurrences = normalized.split(command).length - 1;
      if (occurrences < 2) throw new Error(`Change contract is incomplete: ${command} appears only ${occurrences} time(s) in the resulting file`);
      if (candidate.change.type === 'patch' && (added.split(command).length - 1) < 2) {
        throw new Error(`Change proposal is incomplete: patch must add both registration and handling for ${command}`);
      }
      if (/continue;/.test(candidate.originalContent ?? '') && !this.commandBlock(normalized, command).includes('continue;')) {
        throw new Error(`Change contract is incomplete: ${command} handler does not preserve the CLI continue pattern`);
      }
    }

    for (const expression of this.requiredAccessSignatures(changeDefinition)) {
      if (!this.containsAccess(normalized, expression)) {
        throw new Error(`Change contract is incomplete: resulting source does not use required access ${expression}`);
      }
    }

    if (changeDefinition.includes('no-side-effects-for-status-read')) {
      if (/\.scan\s*\(|\.refresh\s*\(|getIndex\s*\(/.test(added)) {
        throw new Error('Change contract violation: status read must not scan, refresh, or create index state');
      }
    }
  }

  private addedText(change: FileChange): string {
    if (change.type === 'write') return change.content;
    if (change.type === 'delete') return '';
    return change.hunks
      .flatMap((hunk) => hunk.lines.filter((line) => line.type === 'add').map((line) => line.text))
      .join('\n');
  }

  private requiredAccessSignatures(contract: string): string[] {
    const values = contract.split('\n')
      .filter((line) => line.trimStart().startsWith('- fact:') && line.includes(' = '))
      .map((line) => line.slice(line.indexOf(' = ') + 3));
    const signatures = new Set<string>();
    for (const value of values) {
      for (const match of value.matchAll(/[A-Za-z_$][\w$]*(?:(?:\?\.|\.)[A-Za-z_$][\w$]*){1,}/g)) {
        const normalized = match[0].replace(/\?\./g, '.');
        const parts = normalized.split('.');
        if (parts.length < 2) continue;
        const suffix = parts.slice(Math.max(0, parts.length - 3)).join('.');
        if (/^(src|project|cli)\./i.test(suffix)) continue;
        signatures.add(suffix);
      }
    }
    return Array.from(signatures);
  }

  private containsAccess(source: string, signature: string): boolean {
    return source.replace(/\?\./g, '.').includes(signature);
  }

  private commandBlock(source: string, command: string): string {
    const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = source.match(new RegExp(`if\\s*\\([^\\n]*['\"]${escaped}['\"][^\\n]*\\)\\s*\\{([\\s\\S]*?)(?=\\n\\s*if\\s*\\(|\\n\\s*const\\s+resume|$)`));
    return match?.[0] ?? '';
  }

  private lineValue(content: string, prefix: string): string | undefined {
    const line = content.split('\n').find((item) => item.startsWith(prefix));
    return line?.slice(prefix.length).trim() || undefined;
  }
}

import type { FileChange, UnifiedDiffHunk } from '@core/Change/ChangeSet';
import type { OperationResult, ToolCallRequest } from '@model/Result/OperationResult';

export class EditFileRawProtocol {
  public parse(content: string, expectedPath?: string): OperationResult {
    const normalized = content.replace(/\r\n/g, '\n');
    const status = this.line(normalized, 'STATUS');
    if (!status || !['continue', 'waiting', 'completed', 'failed'].includes(status)) {
      throw new Error(`Invalid edit-file STATUS: ${String(status)}`);
    }

    if (status === 'continue') {
      const tool = this.line(normalized, 'TOOL');
      const inputText = this.line(normalized, 'INPUT');
      if (!tool || !inputText) throw new Error('edit-file continue response requires TOOL and INPUT');
      let input: Record<string, unknown>;
      try { input = JSON.parse(inputText) as Record<string, unknown>; }
      catch { throw new Error('edit-file INPUT must be one-line JSON'); }
      const toolCall: ToolCallRequest = { tool, input };
      return this.base('continue', this.line(normalized, 'MESSAGE'), [toolCall], []);
    }

    if (status === 'waiting') {
      return { ...this.base('waiting', this.line(normalized, 'MESSAGE'), [], []), question: this.line(normalized, 'QUESTION') };
    }

    if (status === 'failed') {
      return this.base('failed', this.line(normalized, 'MESSAGE') ?? 'edit-file failed', [], []);
    }

    const action = (this.line(normalized, 'ACTION') ?? (/^DIFF\s*$/m.test(normalized) ? 'patch' : /^CONTENT\s*$/m.test(normalized) ? 'write' : 'patch')).toLowerCase();
    const path = this.line(normalized, 'PATH');
    if (!path) throw new Error('edit-file completed response requires PATH');
    if (expectedPath && path !== expectedPath) {
      throw new Error(`edit-file path mismatch: expected ${expectedPath}, received ${path}`);
    }

    let changes: FileChange[];
    if (action === 'delete') {
      changes = [{ type: 'delete', path }];
    } else if (action === 'patch') {
      changes = [{ type: 'patch', path, hunks: this.parseUnifiedDiff(normalized) }];
    } else if (action === 'write') {
      const contentMarker = /^CONTENT\s*$/m.exec(normalized);
      if (!contentMarker) throw new Error('edit-file write response requires CONTENT');
      let fileContent = normalized.slice(contentMarker.index + contentMarker[0].length).replace(/^\n/, '');
      fileContent = this.stripSingleFence(fileContent);
      changes = [{ type: 'write', path, content: fileContent }];
    } else {
      throw new Error(`Unsupported edit-file ACTION: ${action}`);
    }

    return this.base('completed', this.line(normalized, 'MESSAGE') ?? `Prepared ${action} for ${path}`, [], changes);
  }

  public instructions(targetPath?: string): string {
    return `Edit-file response protocol (NOT JSON):\nPreferred minimal unified diff:\nSTATUS completed\nACTION patch\nPATH ${targetPath ?? '<exact relative path>'}\nDIFF\n--- a/${targetPath ?? '<path>'}\n+++ b/${targetPath ?? '<path>'}\n@@ -<oldLine>,<oldCount> +<newLine>,<newCount> @@\n <unchanged context>\n-<removed line>\n+<added line>\n\nUse standard unified-diff hunks and include enough unchanged context to identify each edit. Hunk line numbers are location hints: Nodus validates the context and, if needed, finds the nearest matching context to the declared old line. Do not regenerate unchanged source.\n\nFallback full write (use only when a minimal diff cannot safely express the edit):\nSTATUS completed\nACTION write\nPATH ${targetPath ?? '<exact relative path>'}\nCONTENT\n<complete resulting file content until EOF>\n\nFor a completed delete:\nSTATUS completed\nACTION delete\nPATH ${targetPath ?? '<exact relative path>'}\n\nRules: edit exactly one file; PATH must equal activeStep.targetPath; the runtime preloads the complete authoritative target source before this call; do not request tools or another file read; do not wrap the whole response in markdown. Prefer ACTION patch with unified diff hunks.`;
  }

  private parseUnifiedDiff(content: string): UnifiedDiffHunk[] {
    const marker = /^DIFF\s*$/m.exec(content);
    if (!marker) throw new Error('edit-file patch response requires DIFF');
    const diff = this.stripSingleFence(content.slice(marker.index + marker[0].length).replace(/^\n/, ''));
    const lines = diff.split('\n');
    const hunks: UnifiedDiffHunk[] = [];
    let index = 0;

    while (index < lines.length) {
      const header = lines[index].match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(?:.*)$/);
      if (!header) { index += 1; continue; }
      const hunk: UnifiedDiffHunk = {
        oldStart: Number(header[1]), oldCount: Number(header[2] ?? 1),
        newStart: Number(header[3]), newCount: Number(header[4] ?? 1), lines: [],
      };
      index += 1;
      while (index < lines.length && !lines[index].startsWith('@@ ')) {
        const line = lines[index];
        if (line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('diff --git ')) { index += 1; continue; }
        if (line === '\\ No newline at end of file') { index += 1; continue; }
        const prefix = line[0];
        if (prefix === ' ') hunk.lines.push({ type: 'context', text: line.slice(1) });
        else if (prefix === '-') hunk.lines.push({ type: 'remove', text: line.slice(1) });
        else if (prefix === '+') hunk.lines.push({ type: 'add', text: line.slice(1) });
        else if (line.length === 0) { index += 1; break; }
        else break;
        index += 1;
      }
      if (hunk.lines.length === 0) throw new Error('edit-file unified diff hunk must contain lines');
      hunks.push(hunk);
    }

    if (hunks.length === 0) throw new Error('edit-file patch response requires at least one unified diff hunk');
    return hunks;
  }

  private line(content: string, name: string): string | undefined {
    const match = content.match(new RegExp(`^${name}\\s+(.+)$`, 'mi'));
    return match?.[1]?.trim();
  }

  private stripSingleFence(content: string): string {
    const opening = content.match(/^```[^\n]*\n/);
    if (!opening) return content;
    let withoutOpening = content.slice(opening[0].length);
    const closing = withoutOpening.match(/\n```\s*$/);
    if (closing) withoutOpening = withoutOpening.slice(0, closing.index);
    return withoutOpening;
  }

  private base(status: OperationResult['status'], message: string | undefined, toolCalls: ToolCallRequest[], changes: FileChange[]): OperationResult {
    return { status, message, toolCalls, changes, observations: [] };
  }
}

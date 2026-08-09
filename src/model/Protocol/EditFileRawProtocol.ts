import type { FileChange } from '@core/Change/ChangeSet';
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

    const action = (this.line(normalized, 'ACTION') ?? 'write').toLowerCase();
    const path = this.line(normalized, 'PATH');
    if (!path) throw new Error('edit-file completed response requires PATH');
    if (expectedPath && path !== expectedPath) {
      throw new Error(`edit-file path mismatch: expected ${expectedPath}, received ${path}`);
    }

    let changes: FileChange[];
    if (action === 'delete') {
      changes = [{ type: 'delete', path }];
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
    return `Edit-file response protocol (NOT JSON):\nFor a completed write:\nSTATUS completed\nACTION write\nPATH ${targetPath ?? '<exact relative path>'}\nCONTENT\n<complete resulting file content until EOF>\n\nFor a completed delete:\nSTATUS completed\nACTION delete\nPATH ${targetPath ?? '<exact relative path>'}\n\nIf you need one tool call first:\nSTATUS continue\nTOOL <tool id>\nINPUT <one-line JSON object>\n\nRules: edit exactly one file; PATH must equal activeStep.targetPath; do not wrap the whole response in markdown; CONTENT is raw file text to EOF and needs no escaping.`;
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

// ChangeExecutor.ts
import type { FileChange, UnifiedDiffHunk } from '@core/Change/ChangeSet';
import type { Execution } from '@core/Execution/Execution';
import type { LogContext } from '@core/Logging/Log';
import type { Logger } from '@core/Logging/Logger';
import type { ProjectSession } from '@project/ProjectSession/ProjectSession';
import type { ToolRegistry } from '@tool/Registry/ToolRegistry';
import type { ToolResult } from '@tool/Tool/Tool';

export interface PreparedFileChange {
  change: FileChange;
  path: string;
  originalContent?: string;
  resultingContent?: string;
}

export class ChangeExecutor {
  public constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly projectSession: ProjectSession,
    private readonly logger: Logger,
  ) {}

  public async prepare(changes: FileChange[]): Promise<PreparedFileChange[]> {
    const tool = this.toolRegistry.get('file-system');
    if (!tool) throw new Error('file-system tool is required to prepare changes');
    const toolContext = { projectRoot: this.projectSession.root, exclude: this.projectSession.configuration.exclude ?? [] };
    const prepared: PreparedFileChange[] = [];

    for (const change of changes) {
      if (change.type === 'delete') {
        prepared.push({ change, path: change.path });
        continue;
      }

      let originalContent: string | undefined;
      const read = await tool.execute({ action: 'read', path: change.path }, toolContext);
      if (read.ok && typeof read.data === 'string') originalContent = read.data;
      else if (change.type === 'patch') throw new Error(`Failed to read patch target ${change.path}: ${read.error ?? 'invalid file content'}`);

      const resultingContent = change.type === 'write'
        ? change.content
        : this.applyUnifiedDiff(originalContent ?? '', change.hunks, change.path);
      prepared.push({ change, path: change.path, originalContent, resultingContent });
    }
    return prepared;
  }

  public async commit(prepared: PreparedFileChange[], execution: Execution, logContext: LogContext): Promise<void> {
    const tool = this.toolRegistry.get('file-system');
    if (!tool) throw new Error('file-system tool is required to commit changes');
    const toolContext = { projectRoot: this.projectSession.root, exclude: this.projectSession.configuration.exclude ?? [] };

    for (const item of prepared) {
      let result: ToolResult;
      if (item.change.type === 'delete') result = await tool.execute({ action: 'delete', path: item.path }, toolContext);
      else result = await tool.execute({ action: 'write', path: item.path, content: item.resultingContent ?? '' }, toolContext);
      execution.addEvent('change-applied', { type: item.change.type, path: item.path, ok: result.ok, error: result.error });
      await this.logger.info('change-applied', { type: item.change.type, path: item.path, ok: result.ok }, logContext);
      if (!result.ok) throw new Error(`Failed to apply change ${item.path}: ${result.error ?? 'unknown error'}`);
    }
  }

  public async apply(changes: FileChange[], execution: Execution, logContext: LogContext): Promise<void> {
    const prepared = await this.prepare(changes);
    await this.commit(prepared, execution, logContext);
  }

  private applyUnifiedDiff(content: string, hunks: UnifiedDiffHunk[], path: string): string {
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const normalized = content.replace(/\r\n/g, '\n');
    const hadTrailingNewline = normalized.endsWith('\n');
    const source = normalized.split('\n');
    if (hadTrailingNewline) source.pop();

    const resolved = hunks.map((hunk) => ({ hunk, index: this.resolveHunkIndex(source, hunk, path) }));
    resolved.sort((a, b) => b.index - a.index);

    for (let index = 1; index < resolved.length; index += 1) {
      const lower = resolved[index - 1];
      const upper = resolved[index];
      const upperLength = this.oldSideLines(upper.hunk).length;
      if (upper.index + upperLength > lower.index) {
        throw new Error(`Patch hunks for ${path} overlap near old lines ${upper.hunk.oldStart} and ${lower.hunk.oldStart}`);
      }
    }

    const result = [...source];
    for (const { hunk, index } of resolved) {
      const oldLines = this.oldSideLines(hunk);
      const newLines = hunk.lines.filter((line) => line.type !== 'remove').map((line) => line.text);
      const actual = result.slice(index, index + oldLines.length);
      if (!this.sameLines(actual, oldLines)) {
        throw new Error(`Patch context for ${path} changed before hunk at old line ${hunk.oldStart} could be applied`);
      }
      result.splice(index, oldLines.length, ...newLines);
    }

    const output = result.join('\n') + (hadTrailingNewline ? '\n' : '');
    return eol === '\r\n' ? output.replace(/\n/g, '\r\n') : output;
  }

  private resolveHunkIndex(source: string[], hunk: UnifiedDiffHunk, path: string): number {
    const oldLines = this.oldSideLines(hunk);
    const expected = Math.max(0, hunk.oldStart - 1);
    if (this.sameLines(source.slice(expected, expected + oldLines.length), oldLines)) return expected;

    const candidates: number[] = [];
    for (let index = 0; index <= source.length - oldLines.length; index += 1) {
      if (this.sameLines(source.slice(index, index + oldLines.length), oldLines)) candidates.push(index);
    }
    if (candidates.length === 0) {
      const previewStart = Math.max(0, expected - 2);
      const previewLength = Math.max(oldLines.length + 4, 8);
      const rejected = oldLines.slice(0, 12).map((line) => JSON.stringify(line)).join(', ');
      const nearby = source.slice(previewStart, previewStart + previewLength)
        .slice(0, 16)
        .map((line, offset) => `${previewStart + offset + 1}:${JSON.stringify(line)}`)
        .join(', ');
      throw new Error(
        `Patch hunk for ${path} could not match context near old line ${hunk.oldStart}. `
        + `Rejected old-side sequence (context/removals only): [${rejected}]. `
        + `Authoritative source near the hint: [${nearby}]`,
      );
    }

    const ranked = candidates
      .map((index) => ({ index, distance: Math.abs(index - expected) }))
      .sort((a, b) => a.distance - b.distance || a.index - b.index);
    if (ranked.length > 1 && ranked[0].distance === ranked[1].distance) {
      throw new Error(`Patch hunk for ${path} is ambiguous near old line ${hunk.oldStart}`);
    }
    return ranked[0].index;
  }

  private oldSideLines(hunk: UnifiedDiffHunk): string[] {
    return hunk.lines
      .filter((line) => line.type === 'context' || line.type === 'remove')
      .map((line) => line.text);
  }

  private sameLines(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((line, index) => line === right[index]);
  }
}

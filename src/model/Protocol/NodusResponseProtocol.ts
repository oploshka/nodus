export interface NodusProtocolSection {
  type: string;
  argument?: string;
  body: string;
  complete: boolean;
}

export interface NodusProtocolDocument {
  version: number;
  sections: NodusProtocolSection[];
  complete: boolean;
}

const START_PATTERN = /^<<<NODUS:(\d+)>>>$/;
const MARKER_PATTERN = /^<<<([A-Z][A-Z0-9_-]*)(?:\s+([^>]+?))?>>>$/;
const END_PATTERN = /^<<<END>>>$/;

/**
 * A deliberately shallow response protocol for LLM output.
 *
 * Grammar:
 *   <<<NODUS:1>>>
 *   <<<TYPE optional-argument>>>
 *   arbitrary multiline body
 *   <<<TYPE2>>>
 *   ...
 *   <<<END>>>
 *
 * A section ends when the next marker starts. This avoids JSON escaping and
 * per-section closing tags. If output is truncated, every section before the
 * active tail remains recoverable.
 */
export class NodusResponseProtocol {
  public static encode(
    sections: Array<Omit<NodusProtocolSection, 'complete'>>,
    version = 1,
  ): string {
    const lines: string[] = [`<<<NODUS:${version}>>>`];
    for (const section of sections) {
      const argument = section.argument?.trim() ? ` ${section.argument.trim()}` : '';
      lines.push(`<<<${section.type.toUpperCase()}${argument}>>>`);
      if (section.body) lines.push(section.body);
    }
    lines.push('<<<END>>>');
    return lines.join('\n');
  }

  public static parse(input: string): NodusProtocolDocument {
    const lines = input.replace(/\r\n/g, '\n').split('\n');
    const first = lines.shift()?.trim() ?? '';
    const start = first.match(START_PATTERN);
    if (!start) throw new Error('Nodus protocol start marker is missing');

    const sections: NodusProtocolSection[] = [];
    let current: NodusProtocolSection | undefined;
    let body: string[] = [];
    let documentComplete = false;

    const flush = (complete: boolean): void => {
      if (!current) return;
      current.body = body.join('\n').replace(/\n+$/, '');
      current.complete = complete;
      sections.push(current);
      current = undefined;
      body = [];
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (END_PATTERN.test(trimmed)) {
        flush(true);
        documentComplete = true;
        break;
      }

      const marker = trimmed.match(MARKER_PATTERN);
      if (marker) {
        flush(true);
        current = {
          type: marker[1],
          argument: marker[2]?.trim(),
          body: '',
          complete: false,
        };
        continue;
      }

      if (current) body.push(line);
    }

    if (!documentComplete) flush(false);
    return { version: Number(start[1]), sections, complete: documentComplete };
  }
}

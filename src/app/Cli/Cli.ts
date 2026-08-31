import { emitKeypressEvents } from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export const CLI_EXIT = Symbol('CLI_EXIT');

export interface CliRuntime {
  projectId: string;
  onRun(): Promise<boolean>;
}

export async function runCli(runtime: CliRuntime): Promise<void> {
  console.log(`Nodus runtime. Project: ${runtime.projectId}`);
  console.log('Commands: /help /exit');
  console.log('Input: Enter = new line, Ctrl+Enter or Ctrl+D = submit, Ctrl+C = cancel; Ctrl+C on empty input = exit.');

  while (await runtime.onRun()) {
    // Each Engine run starts from the CLI input Step and waits for user input there.
  }
}

export async function readCliInput(): Promise<string | typeof CLI_EXIT> {
  while (true) {
    const value = await readInput();
    if (value === undefined) return CLI_EXIT;

    const trimmed = value.trim();
    if (!trimmed) continue;
    if (trimmed === '/exit') return CLI_EXIT;
    if (trimmed === '/help') {
      console.log('/exit - exit\nAny other input starts a process.');
      console.log('Enter = new line; Ctrl+Enter or Ctrl+D = submit; Ctrl+C = cancel current input; Ctrl+C on empty input = exit.');
      continue;
    }

    return value;
  }
}

async function readInput(): Promise<string | undefined> {
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    const readline = createInterface({ input, output });
    try {
      return await readline.question('\n> ');
    } finally {
      readline.close();
    }
  }

  emitKeypressEvents(input);
  const previousRawMode = input.isRaw;
  input.setRawMode(true);
  input.resume();
  output.write('\n> ');

  return new Promise<string | undefined>((resolve) => {
    let buffer = '';
    let previousWasCarriageReturn = false;

    const finish = (value: string | undefined): void => {
      input.off('keypress', onKeypress);
      input.setRawMode(Boolean(previousRawMode));
      output.write('\n');
      resolve(value);
    };

    const onKeypress = (text: string, key: { name?: string; ctrl?: boolean; sequence?: string }): void => {
      if (key.ctrl && key.name === 'c') {
        output.write('^C');
        finish(buffer ? '' : undefined);
        return;
      }

      if ((key.ctrl && (key.name === 'return' || key.name === 'enter')) || (key.ctrl && key.name === 'd')) {
        finish(buffer);
        return;
      }

      if (key.name === 'backspace') {
        if (!buffer) return;
        const last = buffer.at(-1);
        buffer = buffer.slice(0, -1);
        output.write(last === '\n' ? '\x1b[1A\x1b[999C\x1b[K' : '\b \b');
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        buffer += '\n';
        output.write('\n... ');
        previousWasCarriageReturn = true;
        return;
      }

      if (text === '\n' && previousWasCarriageReturn) {
        previousWasCarriageReturn = false;
        return;
      }
      previousWasCarriageReturn = false;

      if (!text || key.ctrl) return;
      buffer += text;
      output.write(text);
    };

    input.on('keypress', onKeypress);
  });
}

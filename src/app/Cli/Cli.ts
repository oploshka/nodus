import { emitKeypressEvents } from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import type { Engine } from '@engine/Engine.js';
import type { tCoreRunDependencies } from '@engine/Core/CoreTsType.js';

export interface CliRuntime {
  engine: Engine;
  dependencies: tCoreRunDependencies;
  projectId: string;
  scanProject(): Promise<number>;
}

export async function runCli(runtime: CliRuntime): Promise<void> {
  console.log(`Nodus runtime. Project: ${runtime.projectId}`);
  console.log('Commands: /help /scan /exit');
  console.log('Input: Enter = new line, Ctrl+Enter or Ctrl+D = submit, Ctrl+C = cancel; Ctrl+C on empty input = exit.');

  while (true) {
    const inputResult = await readCliInput();
    if (inputResult.type === 'exit') break;
    const value = inputResult.value.trim();
    if (!value) continue;
    if (value === '/exit') break;
    if (value === '/help') {
      console.log('/scan - refresh project index\n/exit - exit\nAny other input is sent to engine.run().');
      console.log('Enter = new line; Ctrl+Enter or Ctrl+D = submit; Ctrl+C = cancel current input; Ctrl+C on empty input = exit.');
      continue;
    }
    if (value === '/scan') {
      console.log(`Indexed ${await runtime.scanProject()} files.`);
      continue;
    }

    try {
      const result = await runtime.engine.run(value, runtime.dependencies);
      if (result.status === 'FAILURE') {
        console.error(`\n✗ ${result.reason ?? 'Execution failed.'}`);
      }
    } catch (error) {
      console.error(`\n✗ Задача завершилась ошибкой: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

type CliInputResult = { type: 'input'; value: string } | { type: 'exit' };

async function readCliInput(): Promise<CliInputResult> {
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    const readline = createInterface({ input, output });
    try {
      return { type: 'input', value: await readline.question('\n> ') };
    } finally {
      readline.close();
    }
  }

  emitKeypressEvents(input);
  const previousRawMode = input.isRaw;
  input.setRawMode(true);
  input.resume();
  output.write('\n> ');

  return new Promise<CliInputResult>((resolve) => {
    let buffer = '';
    let previousWasCarriageReturn = false;

    const finish = (result: CliInputResult): void => {
      input.off('keypress', onKeypress);
      input.setRawMode(Boolean(previousRawMode));
      output.write('\n');
      resolve(result);
    };

    const onKeypress = (text: string, key: { name?: string; ctrl?: boolean; sequence?: string }): void => {
      if (key.ctrl && key.name === 'c') {
        output.write('^C');
        finish(buffer ? { type: 'input', value: '' } : { type: 'exit' });
        return;
      }

      if ((key.ctrl && (key.name === 'return' || key.name === 'enter')) || (key.ctrl && key.name === 'd')) {
        finish({ type: 'input', value: buffer });
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

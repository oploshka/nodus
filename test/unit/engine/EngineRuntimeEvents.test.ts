import { describe, expect, it } from 'vitest';
import { EngineRuntime } from '@engine/EngineRuntime.js';
import { EngineStep } from '@engine/EngineStep.js';
import type { EnginePoint, sEnginePointOption } from '@engine/EnginePoint.js';
import type { tEngineEmit, tEngineEventListener } from '@engine/EngineEvent.js';
import type { tEngineRunDependencies } from '@engine/EngineStepInterface.js';

class LeafStep extends EngineStep {
  public constructor(private readonly id: string) {
    super();
  }

  public getId(): string { return this.id; }
  public getGroup(): string { return 'action'; }

  public async run(
    input: unknown,
    dependencies: tEngineRunDependencies,
  ): Promise<unknown> {
    const emit = dependencies.emit as tEngineEmit | undefined;
    emit?.({ type: 'leaf.detail', data: { input } });
    return input;
  }
}

interface FlowPoints {
  first: EnginePoint;
  second: EnginePoint;
}

class FlowStep extends EngineStep {
  private readonly points: FlowPoints = {
    first: this.point({
      name: 'first',
      step: new LeafStep('first-leaf'),
      options: (): readonly sEnginePointOption[] => [
        { point: this.points.second },
      ],
      input: ({ input }) => `${String(input)}:first`,
      response: ({ result }) => this.pointNext(
        this.points.second,
        `${String(result)}:next`,
      ),
    }),
    second: this.point({
      name: 'second',
      step: new LeafStep('second-leaf'),
      response: ({ result }) => result,
    }),
  };

  public getId(): string { return 'flow'; }
  public getGroup(): string { return 'worker'; }

  public async run(): Promise<unknown> {
    return this.points.first;
  }
}

class InvalidFlowStep extends EngineStep {
  private readonly points: FlowPoints = {
    first: this.point({
      name: 'first',
      step: new LeafStep('first-leaf'),
      options: (): readonly sEnginePointOption[] => [],
      response: () => this.pointNext(this.points.second),
    }),
    second: this.point({
      name: 'second',
      step: new LeafStep('second-leaf'),
    }),
  };

  public getId(): string { return 'invalid-flow'; }
  public getGroup(): string { return 'worker'; }

  public async run(): Promise<unknown> {
    return this.points.first;
  }
}

describe('EngineRuntime', () => {
  it('executes Point directives and publishes nested StepRun paths', async () => {
    const published: Array<{
      type: string;
      module?: string;
      path: readonly string[];
    }> = [];
    const onEvent: tEngineEventListener = ({ event, module, path }) => {
      published.push({ type: event.type, module, path });
    };

    const result = await new EngineRuntime().run(
      new FlowStep(),
      'task',
      { onEvent },
    );

    expect(result).toBe('task:first:next');
    expect(published).toEqual([
      { type: 'step.start', module: 'flow', path: ['run-1'] },
      { type: 'step.start', module: 'first-leaf', path: ['run-1', 'run-2'] },
      { type: 'leaf.detail', module: 'first-leaf', path: ['run-1', 'run-2'] },
      { type: 'step.finish', module: 'first-leaf', path: ['run-1', 'run-2'] },
      { type: 'step.start', module: 'second-leaf', path: ['run-1', 'run-3'] },
      { type: 'leaf.detail', module: 'second-leaf', path: ['run-1', 'run-3'] },
      { type: 'step.finish', module: 'second-leaf', path: ['run-1', 'run-3'] },
      { type: 'step.finish', module: 'flow', path: ['run-1'] },
    ]);
  });

  it('rejects a declarative transition that is not currently available', async () => {
    await expect(
      new EngineRuntime().run(new InvalidFlowStep(), 'task'),
    ).rejects.toThrow("Point 'first' cannot continue through 'second'.");
  });
});

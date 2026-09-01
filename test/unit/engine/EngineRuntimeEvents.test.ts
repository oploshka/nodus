import { describe, expect, it } from 'vitest';
import { EngineRuntime } from '@engine/Core/EngineRuntime.js';
import { EngineSchema } from '@engine/Core/EngineSchema.js';
import { ENGINE_STEP, type sEngineSchemaStep, type tEngineEmit } from '@engine/Core/EngineSchemaTsType.js';
import { EngineStep } from '@engine/Core/EngineStep.js';
import type { tEngineEventListener, tEngineRunDependencies } from '@engine/Core/EngineStepInterface.js';

class ParentStep extends EngineStep {
  public getId(): string { return 'parent'; }
  public getGroup(): string { return 'planner'; }

  public async run(): Promise<EngineSchema> {
    return new EngineSchema([{
      type: ENGINE_STEP.SEQUENCE,
      module: 'Leaf',
      task: 'child-task',
      steps: null,
    }]);
  }
}

class LeafStep extends EngineStep {
  public getId(): string { return 'leaf'; }
  public getGroup(): string { return 'action'; }

  public async run(_step: sEngineSchemaStep, dependencies: tEngineRunDependencies) {
    const emit = dependencies.emit as tEngineEmit;
    emit({ type: 'leaf.detail', data: { value: 1 } });
    return { status: 'SUCCESS' as const, value: 'done' };
  }
}

describe('Engine runtime events', () => {
  it('stores removable runtime state on each executed schema step and publishes path context', async () => {
    const published: Array<{ type: string; path: readonly number[] }> = [];
    const onEvent: tEngineEventListener = ({ event, path }) => published.push({ type: event.type, path });
    const runtime = new EngineRuntime({
      groups: {
        planner: { schema: { allowedGroups: ['action'] } },
        action: { schema: false },
      },
      modules: {
        Parent: new ParentStep(),
        Leaf: new LeafStep(),
      },
    });
    const schema = new EngineSchema([{
      type: ENGINE_STEP.SEQUENCE,
      module: 'Parent',
      steps: null,
    }]);

    const result = await runtime.run(schema, { onEvent });

    expect(result.status).toBe('SUCCESS');
    const parent = schema.value[0]!;
    expect(parent.runtime?.context?.steps).toEqual([]);
    expect(parent.runtime?.events.map((event) => event.type)).toEqual(['step.start', 'step.finish']);

    const leaf = parent.runtime?.schema?.[0];
    expect(leaf?.output?.value).toBe('done');
    expect(leaf?.runtime?.events.map((event) => event.type)).toEqual([
      'step.start',
      'leaf.detail',
      'step.finish',
    ]);

    expect(published).toEqual([
      { type: 'step.start', path: [1] },
      { type: 'step.start', path: [1, 1] },
      { type: 'leaf.detail', path: [1, 1] },
      { type: 'step.finish', path: [1, 1] },
      { type: 'step.finish', path: [1] },
    ]);
  });
});

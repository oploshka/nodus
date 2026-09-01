import type { FileSystem } from './Common/Tools/FileSystem.js';
import { EngineRuntime } from './Core/EngineRuntime.js';
import { EngineSchema } from './Core/EngineSchema.js';
import type { sEngineEvent, tEngineEmit } from './Core/EngineSchemaTsType.js';
import type { sEngineRunResult } from './Core/EngineRuntimeTsType.js';
import type { tEngineEventListener, tEngineRunDependencies } from './Core/EngineStepInterface.js';
import type { sEngineConfig } from './EngineConfigTsType.js';
import { ProjectEditor } from './Process/Edit/ProjectEditor.js';
import { EditStrategyDiff } from './Process/Edit/Strategy/EditStrategyDiff.js';
import { EditStrategyRangeReplace } from './Process/Edit/Strategy/EditStrategyRangeReplace.js';
import type { LanguageConfiguration } from './Type/LanguageConfiguration.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';

const EDIT_GUIDANCE = 'Implement only the accepted semantic edit. Preserve unrelated project content.';

/** Public entry point for the configurable Engine runtime. */
export class Engine {
  private readonly runtime: EngineRuntime;

  public constructor(config: sEngineConfig) {
    this.runtime = new EngineRuntime(config);
  }

  public async run(
    schema: EngineSchema,
    dependencies: tEngineRunDependencies = {},
  ): Promise<sEngineRunResult> {
    const edit = createRunEdit(dependencies);
    const runDependencies = edit ? { ...dependencies, edit } : dependencies;
    const result = await this.runtime.run(schema, runDependencies);
    if (result.status !== 'SUCCESS' || !edit) return result;

    const applied = await edit.apply(undefined, createRunEmit(dependencies));
    if (applied.status === 'completed') return result;

    return {
      ...result,
      status: 'FAILURE',
      output: { status: 'FAILURE', reason: applied.reason },
      reason: applied.reason,
    };
  }
}

function createRunEdit(dependencies: tEngineRunDependencies): ProjectEditor | undefined {
  const target = dependencies.target as { fileSystem?: FileSystem } | undefined;
  const model = dependencies.model as ModelRunner | undefined;
  const language = dependencies.language as LanguageConfiguration | undefined;
  if (!target?.fileSystem || !model || !language) return undefined;

  return new ProjectEditor(target.fileSystem, [
    new EditStrategyRangeReplace(target.fileSystem, model, language, EDIT_GUIDANCE),
    new EditStrategyDiff(model, language, EDIT_GUIDANCE),
  ]);
}

function createRunEmit(dependencies: tEngineRunDependencies): tEngineEmit {
  const listener = dependencies.onEvent as tEngineEventListener | undefined;
  return (event: sEngineEvent) => listener?.({ event, path: [] });
}

import type { FileSystem } from './Common/Tools/FileSystem.js';
import { EngineRuntime } from './Core/EngineRuntime.js';
import { EngineSchema } from './Core/EngineSchema.js';
import type { sEngineRunResult } from './Core/EngineRuntimeTsType.js';
import type { tEngineRunDependencies } from './Core/EngineStepInterface.js';
import type { sEngineConfig } from './EngineConfigTsType.js';
import { ProjectEditor } from './Process/Edit/ProjectEditor.js';
import { DiffEditStrategy } from './Process/Edit/Strategy/DiffEditStrategy.js';
import { RangeReplaceEditStrategy } from './Process/Edit/Strategy/RangeReplaceEditStrategy.js';
import type { EngineLogger } from './Type/EngineLogger.js';
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

    const applied = await edit.apply();
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
  const logger = dependencies.logger as EngineLogger | undefined;
  const language = dependencies.language as LanguageConfiguration | undefined;
  if (!target?.fileSystem || !model || !logger || !language) return undefined;

  return new ProjectEditor(target.fileSystem, logger, [
    new RangeReplaceEditStrategy(target.fileSystem, model, logger, language, EDIT_GUIDANCE),
    new DiffEditStrategy(model, logger, language, EDIT_GUIDANCE),
  ]);
}

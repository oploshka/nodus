import { resolve } from 'node:path';
import { rm } from 'node:fs/promises';
import { FileSystem } from '@engine/Common/Tools/FileSystem.js';
import { PathResolver } from '@engine/Common/Tools/PathResolver.js';
import {
  ProjectFileIndex,
  type iProjectFileIndex,
  type sProjectFileIndexState,
} from '@engine/Project/File/Index/ProjectFileIndex.js';
import { ProjectFileIndex_Scanner } from '@engine/Project/File/Index/ProjectFileIndex_Scanner.js';
import {
  DEFAULT_PROJECT_FILE_INDEX_CACHE_PATH,
  ProjectFileIndex_Store,
} from '@engine/Project/File/Index/ProjectFileIndex_Store.js';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { sTargetConfig } from '@engine/Type/EngineConfiguration.js';

export interface iProjectRuntime {
  id: string;
  root: string;
  fileSystem: FileSystem;
  fileIndex: iProjectFileIndex;
}

export async function createProject(
  configuration: sTargetConfig,
  logger: EngineLogger,
): Promise<iProjectRuntime> {
  const scanner = new ProjectFileIndex_Scanner();
  const indexStore = new ProjectFileIndex_Store(
    configuration.root,
    configuration.id,
    logger,
    configuration.indexCachePath,
  );
  const loadedState = await indexStore.load();
  const initialState: sProjectFileIndexState = loadedState ?? {
    version: 1,
    projectId: configuration.id,
    root: configuration.root,
    scannedAt: new Date(0).toISOString(),
    files: [],
  };
  const fileIndex = new ProjectFileIndex(initialState);
  const pathResolver = new PathResolver(configuration.root);
  const fileSystem = new FileSystem(
    configuration.root,
    pathResolver,
    () => fileIndex.snapshot(),
    logger,
    configuration.exclude,
  );

  if (scanner.shouldScanOnOpen(configuration.scanMode)) {
    const state = await scanner.scan(configuration);
    fileIndex.replace(state);
    await indexStore.save(state);
    logger.info('project.scan', { files: state.files.length });
  }

  return {
    id: configuration.id,
    root: configuration.root,
    fileSystem,
    fileIndex,
  };
}

export async function clearProjectIndex(configuration: sTargetConfig): Promise<void> {
  const indexPath = configuration.indexCachePath ?? DEFAULT_PROJECT_FILE_INDEX_CACHE_PATH;
  await rm(resolve(configuration.root, indexPath), { force: true });
}

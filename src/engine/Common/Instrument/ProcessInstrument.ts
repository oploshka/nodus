import type { ProjectFiles } from '@engine/Project/File/ProjectFiles.js';
import type { ProjectEditor } from '@engine/Edit/ProjectEditor.js';

/** Small capability contracts exposed to individual Process implementations. */
export interface EditInstrument {
  readonly edit: ProjectEditor;
}

export interface ProjectInstrument {
  readonly project: ProjectFiles;
}

export interface WorkerInstrument extends EditInstrument {}

export interface ResearchInstrument extends EditInstrument, ProjectInstrument {}

/**
 * Engine-owned task-local instrument container.
 * The runtime object is shared, while each Process accepts only the capability interface it needs.
 */
export class ProcessInstrument implements EditInstrument, ProjectInstrument {
  public constructor(
    public readonly project: ProjectFiles,
    public readonly edit: ProjectEditor,
  ) {}
}

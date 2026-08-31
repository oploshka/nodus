import type { ProjectEditor} from "@engine/Process/Edit/ProjectEditor.js";

/** Small capability contracts exposed to individual Process implementations. */
export interface EditInstrument {
  readonly edit: ProjectEditor;
}

export interface WorkerInstrument extends EditInstrument {}
export interface ResearchInstrument extends EditInstrument {}

/** Engine-owned task-local instrument container. */
export class ProcessInstrument implements EditInstrument {
  public constructor(public readonly edit: ProjectEditor) {}
}

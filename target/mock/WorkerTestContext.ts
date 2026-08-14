import type { ProjectEditRequest, ProjectEditResult } from '@engine/Edit/EditTypes.js';
import type { ProjectEditor } from '@engine/Edit/ProjectEditor.js';
import type { PlanStep } from '@engine/Planner/Plan.js';
import { Task } from '@engine/Task/Task.js';
import type { WorkerInstrument } from '@engine/Common/Instrument/ProcessInstrument.js';
import type { WorkerRunData } from '@engine/Worker/Worker.js';

export interface WorkerTestContextOptions {
  taskDescription?: string;
  projectId?: string;
  step?: Partial<PlanStep>;
  files?: Record<string, string>;
}

export class WorkerEditMock {
  public readonly changes: ProjectEditRequest[] = [];
  private readonly files = new Map<string, string>();

  public constructor(files: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(files)) this.files.set(path, content);
  }

  public async read(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`WorkerEditMock file does not exist: ${path}`);
    return content;
  }

  public set(path: string, content: string): void {
    this.files.set(path, content);
  }

  public async change(_task: Task, _step: PlanStep, request: ProjectEditRequest): Promise<ProjectEditResult> {
    this.changes.push(request);
    return {
      status: 'completed',
      files: request.edits.length,
      operations: request.edits.length,
      strategy: request.strategy,
      paths: request.edits.map((edit) => edit.path),
    };
  }

  public asProjectEditor(): ProjectEditor {
    return this as unknown as ProjectEditor;
  }
}

export function createWorkerTestContext(options: WorkerTestContextOptions = {}): {
  data: WorkerRunData;
  instrument: WorkerInstrument;
  edit: WorkerEditMock;
} {
  const task = new Task(options.taskDescription ?? 'task', options.projectId ?? 'p');
  const step: PlanStep = {
    id: options.step?.id ?? 's1',
    goal: options.step?.goal ?? 'goal',
    constraints: options.step?.constraints ?? [],
    decompositionType: options.step?.decompositionType ?? 'coherent-outcome',
  };
  const edit = new WorkerEditMock(options.files);

  return {
    data: { task, step },
    instrument: { edit: edit.asProjectEditor() },
    edit,
  };
}

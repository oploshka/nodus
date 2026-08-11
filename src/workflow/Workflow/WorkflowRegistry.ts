import type { WorkflowDefinition } from './Workflow';

export class WorkflowRegistry {
  private readonly workflows = new Map<string, WorkflowDefinition>();

  public register(workflow: WorkflowDefinition): void {
    this.workflows.set(workflow.id, workflow);
  }

  public get(id: string): WorkflowDefinition | undefined {
    return this.workflows.get(id);
  }

  public require(id: string): WorkflowDefinition {
    const workflow = this.get(id);
    if (!workflow) throw new Error(`Workflow is not registered: ${id}`);
    return workflow;
  }
}

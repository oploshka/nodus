import type { Stage } from './Stage';

export class StageRegistry {
  private readonly stages = new Map<string, Stage>();

  public register(stage: Stage): void {
    this.stages.set(stage.definition.id, stage);
  }

  public get(id: string): Stage | undefined {
    return this.stages.get(id);
  }

  public require(id: string): Stage {
    const stage = this.get(id);
    if (!stage) throw new Error(`Stage is not registered: ${id}`);
    return stage;
  }
}

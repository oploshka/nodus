import type { Tool, ToolDefinition } from '@model/Tool/Tool.js';

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();
  public register(tool: Tool): void { this.tools.set(tool.definition.id, tool); }
  public get(id: string): Tool | undefined { return this.tools.get(id); }
  public definitions(): ToolDefinition[] { return [...this.tools.values()].map((tool) => tool.definition); }
}

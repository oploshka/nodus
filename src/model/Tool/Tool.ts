export interface ToolContext {
  projectRoot: string;
  exclude: string[];
  /** Optional task-local file access supplied by Engine/Worker execution. */
  fileAccess?: {
    read(path: string): Promise<string>;
    write(path: string, content: string): Promise<void>;
  };
}

export interface ToolDefinition {
  id: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface Tool {
  definition: ToolDefinition;
  execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

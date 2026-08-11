export interface WorkflowNode {
  id: string;
  stageId: string;
}

export interface WorkflowEdge {
  from: string;
  to: string;
}

export interface WorkflowDefinition {
  id: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

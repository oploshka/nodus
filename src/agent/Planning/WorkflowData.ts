// WorkflowData.ts
export type WorkflowDataKind =
  | 'evidence'
  | 'fact'
  | 'change-definition'
  | 'change-result'
  | 'review-result'
  | 'verification-result'
  | 'final-result';

export interface WorkflowDataRef {
  kind: WorkflowDataKind;
  key: string;
  scope?: string;
}

const KIND_SET = new Set<WorkflowDataKind>([
  'evidence',
  'fact',
  'change-definition',
  'change-result',
  'review-result',
  'verification-result',
  'final-result',
]);

export function formatWorkflowDataRef(ref: WorkflowDataRef): string {
  const scope = ref.scope?.trim();
  return `${ref.kind}:${ref.key}${scope ? `@${scope}` : ''}`;
}

export function parseWorkflowDataRef(value: string): WorkflowDataRef {
  const normalized = value.trim();
  const match = normalized.match(/^([a-z-]+):([a-z0-9][a-z0-9._-]{0,95})(?:@([a-z0-9][a-z0-9._-]{0,47}))?$/i);
  if (!match) throw new Error(`Invalid workflow data ref: ${value}`);

  const kind = match[1] as WorkflowDataKind;
  if (!KIND_SET.has(kind)) throw new Error(`Unsupported workflow data kind: ${match[1]}`);

  return {
    kind,
    key: match[2],
    scope: match[3],
  };
}

export function workflowDataRefEquals(left: WorkflowDataRef, right: WorkflowDataRef): boolean {
  return formatWorkflowDataRef(left) === formatWorkflowDataRef(right);
}

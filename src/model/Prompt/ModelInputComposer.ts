// ModelInputComposer.ts
import type { ToolContextEntry } from '@core/Execution/Execution';
import type { KnowledgeEntry } from '@research/Entry/KnowledgeEntry';
import type { ModelMessage } from '@model/Request/ModelRequest';
import type { StepEvidenceItem } from '@model/Result/OperationResult';
import type { ToolDefinition } from '@model/Tool/Tool/Tool';

export interface LogicalFactView {
  key: string;
  value: string;
  evidence?: StepEvidenceItem[];
  producerStepId?: string;
}

export interface ActiveStepView {
  id: string;
  type: string;
  action?: string;
  subject?: string;
  goal?: string;
  attempt?: number;
  maxAttempts?: number;
  retryReason?: string;
  inputs?: string[];
  outputs?: string[];
  targetPath?: string;
  sourceHints?: string[];
  requirements?: Array<{ ref: string; description: string; constraints?: string[] }>;
}

export interface ActiveEvidenceView {
  findings?: string[];
  evidence?: StepEvidenceItem[];
  missing?: string[];
}

export interface ProjectView {
  projectId: string;
  root?: string;
  indexedFiles?: string[];
  hasIndex?: boolean;
}

export function userMessage(title: string, body: string): ModelMessage {
  return {
    role: 'user',
    content: `${title}\n${body.trim()}`.trim(),
  };
}

export function taskMessage(description: string, context?: unknown): ModelMessage {
  const parts = [description.trim()];
  const compactContext = compactUnknown(context, 1200);
  if (compactContext) parts.push(`Context: ${compactContext}`);
  return userMessage('Task:', parts.join('\n'));
}

export function activeStepMessage(step: ActiveStepView, responseLanguage?: string): ModelMessage {
  const lines = [
    `Type: ${step.type}`,
    step.action ? `Action: ${step.action}` : '',
    step.subject ? `Subject: ${step.subject}` : '',
    step.targetPath ? `Target file: ${step.targetPath}` : '',
    step.sourceHints?.length ? `Source hints: ${step.sourceHints.join(', ')}` : '',
    step.inputs?.length ? `Inputs: ${step.inputs.join(', ')}` : '',
    step.outputs?.length ? `Outputs: ${step.outputs.join(', ')}` : '',
    step.requirements?.length ? `Requirements:\n${step.requirements.map((item) => `- ${item.ref}: ${item.description}${item.constraints?.length ? ` [constraints=${item.constraints.join(', ')}]` : ''}`).join('\n')}` : '',
    step.attempt !== undefined && step.maxAttempts !== undefined ? `Attempt: ${step.attempt}/${step.maxAttempts}` : '',
    step.retryReason ? `Previous attempt failed: ${step.retryReason}` : '',
    responseLanguage ? `Response language: ${responseLanguage}` : '',
  ].filter(Boolean);
  return userMessage('Active step:', lines.join('\n'));
}

export function projectMessage(project: ProjectView): ModelMessage | undefined {
  const files = project.indexedFiles ?? [];
  const lines = [
    `Project ID: ${project.projectId}`,
    project.hasIndex !== undefined ? `Index available: ${project.hasIndex ? 'yes' : 'no'}` : '',
    files.length > 0 ? `Relevant files:\n${files.map((file) => `- ${file}`).join('\n')}` : '',
  ].filter(Boolean);
  return lines.length > 0 ? userMessage('Project context:', lines.join('\n')) : undefined;
}

export function factsMessage(facts: LogicalFactView[]): ModelMessage | undefined {
  if (facts.length === 0) return undefined;
  const lines = facts.map((fact) => {
    const locations = factLocations(fact.evidence ?? []);
    const value = compactLogicalText(fact.value, 420);
    const parts = [`- ${fact.key}: ${value || '(value omitted; use listed source files when needed)'}`];
    if (locations.length > 0) parts.push(`  sources: ${locations.join(', ')}`);
    return parts.join('\n');
  });
  return userMessage('Known facts:', lines.join('\n'));
}

export function activeEvidenceMessage(active?: ActiveEvidenceView): ModelMessage | undefined {
  if (!active) return undefined;
  const findings = (active.findings ?? []).slice(0, 8).map((item) => compactLogicalText(item, 300)).filter(Boolean);
  const evidence = compactEvidence(active.evidence ?? [], 16);
  const missing = (active.missing ?? []).slice(0, 6).map((item) => compactLogicalText(item, 240)).filter(Boolean);
  if (findings.length === 0 && evidence.length === 0 && missing.length === 0) return undefined;

  const sections: string[] = [];
  if (findings.length > 0) sections.push(`Findings:\n${findings.map((item) => `- ${item}`).join('\n')}`);
  if (evidence.length > 0) sections.push(`Evidence:\n${evidence.join('\n')}`);
  if (missing.length > 0) sections.push(`Missing:\n${missing.map((item) => `- ${item}`).join('\n')}`);
  return userMessage('Current step evidence:', sections.join('\n\n'));
}

export function knowledgeMessage(title: string, entries: KnowledgeEntry[]): ModelMessage | undefined {
  if (entries.length === 0) return undefined;
  const lines = entries.slice(0, 12).map((entry) => {
    const scope = entry.scopeValue ? `${entry.scope}:${entry.scopeValue}` : entry.scope;
    return `- [${entry.type}; ${scope}] ${compactLogicalText(entry.content, 420)}`;
  });
  return userMessage(`${title}:`, lines.join('\n'));
}


export function toolDescriptionsMessage(definitions: ToolDefinition[]): ModelMessage | undefined {
  if (definitions.length === 0) return undefined;
  return userMessage(
    'Available tools:',
    definitions.map((tool) => `- ${tool.id}: ${tool.description}`).join('\n'),
  );
}

export function toolDefinitionsMessage(definitions: ToolDefinition[]): ModelMessage | undefined {
  if (definitions.length === 0) return undefined;
  const lines = definitions.map((tool) => {
    const schema = Object.entries(tool.inputSchema ?? {})
      .map(([key, value]) => `  - ${key}: ${compactUnknown(value, 220)}`)
      .join('\n');
    return [
      `- ${tool.id}: ${tool.description}`,
      schema ? `  Input fields (use these exact names):\n${schema}` : '',
    ].filter(Boolean).join('\n');
  });
  return userMessage('Available tools:', lines.join('\n'));
}

export function toolResultMessages(entries: ToolContextEntry[], targetPath?: string): ModelMessage[] {
  const messages: ModelMessage[] = [];
  for (const entry of entries) {
    const tool = entry.call.tool;
    const input = entry.call.input ?? {};
    const path = typeof input.path === 'string' ? input.path : undefined;

    if (tool === 'file-system' && String(input.action ?? '') === 'read' && entry.result.ok && typeof entry.result.data === 'string') {
      const isTargetSource = Boolean(targetPath && path === targetPath);
      messages.push(userMessage(
        isTargetSource
          ? `Target source file (${path}) — authoritative current content:`
          : `Source file returned by requested tool read${path ? ` (${path})` : ''}:`,
        entry.result.data,
      ));
      continue;
    }

    const summary = summarizeToolResult(entry);
    messages.push(userMessage(`Tool result (${tool}):`, summary));
  }
  return messages;
}

export function compactEvidence(evidence: StepEvidenceItem[], limit = 12): string[] {
  return evidence.slice(0, limit).map((item) => {
    const location = [item.path, item.symbol].filter(Boolean).join('#');
    const fact = compactEvidenceFact(item.fact, 420);
    return `- ${location ? `${location} — ` : ''}${fact}`;
  });
}

export function compactLogicalText(value: string, limit = 420): string {
  const normalized = value.replace(/\r/g, '').trim();
  if (!normalized) return '';

  const fileRead = normalized.match(/^(.*?)\s*File read succeeded\. Content excerpt:/is);
  if (fileRead) {
    const prefix = fileRead[1]?.trim().replace(/:\s*$/, '');
    return prefix ? `${prefix} (source file was read; full source omitted from reusable context)` : 'Source file was read; full source omitted from reusable context.';
  }

  if (normalized.includes('File read succeeded. Content excerpt:')) {
    return normalized.slice(0, normalized.indexOf('File read succeeded. Content excerpt:')).trim() || 'Source file was read; full source omitted from reusable context.';
  }

  return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
}

function compactEvidenceFact(value: string, limit: number): string {
  const normalized = value.replace(/\r/g, '').trim();
  if (normalized.startsWith('File read succeeded. Content excerpt:')) {
    return 'File read succeeded; full source omitted from reusable evidence.';
  }
  return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
}

function factLocations(evidence: StepEvidenceItem[]): string[] {
  return Array.from(new Set(evidence.flatMap((item) => {
    if (!item.path) return [];
    return [item.symbol ? `${item.path}#${item.symbol}` : item.path];
  }))).slice(0, 6);
}

function summarizeToolResult(entry: ToolContextEntry): string {
  const input = entry.call.input ?? {};
  const lines = [
    `Call: ${formatToolCall(entry.call.tool, input)}`,
    `Status: ${entry.result.ok ? 'ok' : 'failed'}`,
  ];
  if (entry.result.error) lines.push(`Error: ${compactLogicalText(entry.result.error, 500)}`);

  const data = entry.result.data;
  if (Array.isArray(data)) {
    const items = data.slice(0, 20).map((item) => {
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        const path = typeof record.path === 'string' ? record.path : undefined;
        const line = typeof record.line === 'number' ? `:${record.line}` : '';
        const text = typeof record.text === 'string' ? record.text : compactUnknown(record, 320);
        return `- ${path ? `${path}${line}` : ''}${path && text ? ' — ' : ''}${text}`;
      }
      return `- ${compactUnknown(item, 320)}`;
    });
    lines.push(`Results (${data.length}):\n${items.join('\n')}`);
  } else {
    const compact = compactUnknown(data, 1800);
    if (compact) lines.push(`Result: ${compact}`);
  }
  return lines.join('\n');
}

function formatToolCall(tool: string, input: Record<string, unknown>): string {
  const parts = Object.entries(input)
    .slice(0, 8)
    .map(([key, value]) => `${key}=${compactUnknown(value, 160)}`);
  return `${tool}${parts.length > 0 ? ` (${parts.join(', ')})` : ''}`;
}

function compactUnknown(value: unknown, limit: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') {
    const normalized = value.replace(/\r/g, '').trim();
    return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
  }
  try {
    const text = JSON.stringify(value);
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
  } catch {
    const text = String(value);
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
  }
}

// RequirementResolutionPlanner.ts
import { PlanCompiler } from '@agent/Planning/PlanCompiler';
import type { EvidenceKind, RequirementEntry, RequirementMap } from '@agent/Planning/RequirementMap';
import type { ExecutionFact } from '@agent/Planning/ExecutionContext';
import type { PlanStep, StepRequirementContract, TaskPlan } from '@agent/Planning/TaskPlan';
import { formatWorkflowDataRef, parseWorkflowDataRef } from '@agent/Planning/WorkflowData';
import type { StepRegistry } from '@agent/Planning/StepRegistry';
import type { ModelConfiguration } from '@core/Configuration/Configuration';
import type { Logger } from '@core/Logging/Logger';
import type { Task } from '@core/Task/Task';
import type { ModelAdapter } from '@model/Adapter/ModelAdapter';
import { composePrompt } from '@model/Prompt/PromptComposer';
import { compactEvidence, factsMessage, taskMessage, userMessage } from '@model/Prompt/ModelInputComposer';
import type { ModelRequest } from '@model/Request/ModelRequest';
import { transportMessages } from '@model/Request/ModelMessageTransport';
import type { StepEvidenceItem } from '@model/Result/OperationResult';
import type { ProjectSession } from '@project/ProjectSession/ProjectSession';

const EVIDENCE_KINDS = new Set<EvidenceKind>(['file', 'symbol', 'definition', 'usage', 'reference', 'example']);

export interface RequirementResolutionPlan {
  mode: 'knowledge' | 'capability-addition';
  reason: string;
  map: RequirementMap;
  plan: TaskPlan;
}

interface RawResolution {
  status?: unknown;
  reason?: unknown;
  goal?: unknown;
  root?: unknown;
  entries?: unknown;
  recheck?: unknown;
}

interface RawEntry {
  ref?: unknown;
  description?: unknown;
  requires?: unknown;
  evidenceKind?: unknown;
  sourceHints?: unknown;
  targetPath?: unknown;
  constraints?: unknown;
}

export class RequirementResolutionPlanner {
  private readonly compiler: PlanCompiler;

  public constructor(
    private readonly configuration: ModelConfiguration,
    private readonly adapter: ModelAdapter,
    private readonly projectSession: ProjectSession,
    private readonly stepRegistry: StepRegistry,
    private readonly logger: Logger,
  ) {
    this.compiler = new PlanCompiler(stepRegistry);
  }

  public async plan(input: {
    task: Task;
    executionId: string;
    parentStep: PlanStep;
    requirement: StepRequirementContract;
    evidence: StepEvidenceItem[];
    facts: ExecutionFact[];
    depth: number;
  }): Promise<RequirementResolutionPlan | undefined> {
    const language = this.resolveLanguage(input.task.description);
    const request: ModelRequest = {
      model: this.configuration.model,
      temperature: 0,
      maxTokens: Math.min(this.configuration.maxTokens ?? 900, 900),
      messages: transportMessages([
        {
          role: 'system',
          content: composePrompt({
            purpose: 'Build a small child requirement map that resolves one missing requirement without changing the parent task plan.',
            rules: [
              'Resolve only the exact TARGET requirement. Do not broaden the parent task.',
              'For status=planned the child map root MUST equal TARGET exactly. For status=add-capability the root is the minimal supporting change-definition and recheck MUST equal TARGET. The parent requirement is always rechecked after the child plan runs.',
              'Return requirements, not Nodus step types, tool calls, or execution order.',
              'Existing related evidence is context only and does not satisfy TARGET by itself.',
              'For an evidence TARGET, first try status=planned with the same evidence ref and better evidenceKind/sourceHints from existing Project candidates.',
              'For a fact TARGET, first try status=planned with the same fact ref and only the minimal evidence dependencies needed to establish it.',
              'If the required project capability truly does not exist and the parent task cannot be completed without adding it, status=add-capability may describe one minimal supporting code change. In that mode root must be a change-definition and recheck must equal TARGET exactly.',
              'Capability-addition is not a substitute for search. Use it only when available evidence indicates the capability is absent, never merely because the first retrieval was weak.',
              'Preserve TARGET constraints. Never weaken read-only, existing-state, no-side-effects, nullable, or similar constraints.',
              'Use only sourceHints and targetPath values present in Project candidates. Do not invent files, symbols, APIs, or identifiers.',
              'If no useful child map can be formed from the available project candidates, return status=unresolvable.',
              'Keep the child map small: at most 6 entries.',
            ],
          }, { returnFormat: this.protocol(input.requirement.ref) }),
        },
        taskMessage(input.task.description, input.task.context),
        userMessage('TARGET requirement:', this.requirementText(input.requirement)),
        userMessage('Parent step:', `${input.parentStep.type}/${input.parentStep.action ?? ''} — ${input.parentStep.subject ?? input.parentStep.goal}`),
        userMessage('Related/current evidence:', compactEvidence(input.evidence, 12).join('\n') || '- none'),
        ...this.optionalMessage(factsMessage(input.facts.slice(-12))),
        userMessage('Project candidates:', this.projectCandidateFiles().map((path) => `- ${path}`).join('\n') || '- none'),
        userMessage('Resolution depth:', String(input.depth)),
      ], this.configuration.messageLayout),
    };

    try {
      const response = await this.adapter.complete(request);
      const parsed = this.parse(response.content, input.requirement);
      if (!parsed) return undefined;
      const plan = parsed.mode === 'capability-addition'
        ? this.compiler.compileCapabilityResolution(parsed.map, language)
        : this.compiler.compileResolution(parsed.map, language);
      await this.logger.info('requirement-resolution-planned', {
        requirement: input.requirement.ref,
        mode: parsed.mode,
        reason: parsed.reason,
        depth: input.depth,
        root: formatWorkflowDataRef(parsed.map.root),
        steps: plan.steps,
      }, {
        projectId: input.task.projectId,
        conversationId: input.task.conversationId,
        taskId: input.task.id,
        executionId: input.executionId,
      });
      return { ...parsed, plan };
    } catch (error) {
      await this.logger.warn('requirement-resolution-failed', {
        requirement: input.requirement.ref,
        error: String(error),
      }, {
        projectId: input.task.projectId,
        conversationId: input.task.conversationId,
        taskId: input.task.id,
        executionId: input.executionId,
      });
      return undefined;
    }
  }

  private parse(content: string, original: StepRequirementContract): { mode: 'knowledge' | 'capability-addition'; reason: string; map: RequirementMap } | undefined {
    const raw = JSON.parse(this.extractJson(content)) as RawResolution;
    if (raw.status === 'unresolvable') return undefined;
    const mode = raw.status === 'planned'
      ? 'knowledge'
      : raw.status === 'add-capability'
        ? 'capability-addition'
        : undefined;
    if (!mode) throw new Error(`Unsupported resolution status: ${String(raw.status)}`);
    if (typeof raw.root !== 'string') throw new Error('Resolution has no root');
    if (mode === 'knowledge' && raw.root !== original.ref) {
      throw new Error(`Knowledge resolution root must remain ${original.ref}`);
    }
    if (mode === 'capability-addition' && raw.recheck !== original.ref) {
      throw new Error(`Capability resolution must recheck ${original.ref}`);
    }
    if (typeof raw.goal !== 'string' || !raw.goal.trim()) throw new Error('Resolution has no goal');
    if (!Array.isArray(raw.entries) || raw.entries.length === 0) throw new Error('Resolution has no entries');

    const entries = raw.entries.slice(0, 6).map((entry) => this.parseEntry(entry as RawEntry));
    const root = parseWorkflowDataRef(raw.root);
    const rootEntry = entries.find((entry) => formatWorkflowDataRef(entry.ref) === raw.root);
    if (!rootEntry) throw new Error(`Resolution does not declare root ${raw.root}`);
    if (mode === 'capability-addition' && root.kind !== 'change-definition') {
      throw new Error('Capability-addition resolution root must be change-definition');
    }

    if (mode === 'knowledge') {
      rootEntry.constraints = Array.from(new Set([...(original.constraints ?? []), ...(rootEntry.constraints ?? [])]));
      if (!rootEntry.description.trim()) rootEntry.description = original.description;
    } else {
      rootEntry.constraints = Array.from(new Set([...(rootEntry.constraints ?? []), ...(original.constraints ?? []), 'minimal-supporting-change']));
    }

    const keys = new Set(entries.map((entry) => formatWorkflowDataRef(entry.ref)));
    if (keys.size !== entries.length) throw new Error('Resolution returned duplicate refs');
    for (const entry of entries) {
      for (const dependency of entry.requires) {
        if (!keys.has(formatWorkflowDataRef(dependency))) {
          throw new Error(`Resolution dependency is undeclared: ${formatWorkflowDataRef(dependency)}`);
        }
      }
      this.validateEntry(entry);
    }

    return {
      mode,
      reason: typeof raw.reason === 'string' && raw.reason.trim() ? raw.reason.trim().slice(0, 400) : 'Resolve missing requirement.',
      map: { version: 1, goal: raw.goal.trim().slice(0, 300), root, entries },
    };
  }

  private parseEntry(raw: RawEntry): RequirementEntry {
    if (typeof raw.ref !== 'string') throw new Error('Resolution entry has no ref');
    if (typeof raw.description !== 'string' || !raw.description.trim()) throw new Error(`Resolution ${raw.ref} has no description`);
    const evidenceKind = typeof raw.evidenceKind === 'string' && EVIDENCE_KINDS.has(raw.evidenceKind as EvidenceKind)
      ? raw.evidenceKind as EvidenceKind
      : undefined;
    return {
      ref: parseWorkflowDataRef(raw.ref),
      description: raw.description.trim().slice(0, 320),
      requires: Array.isArray(raw.requires) ? raw.requires.map(String).map(parseWorkflowDataRef) : [],
      evidenceKind,
      sourceHints: Array.isArray(raw.sourceHints)
        ? raw.sourceHints.map(String).map((path) => this.resolveProjectPath(path)).filter((path): path is string => Boolean(path)).slice(0, 4)
        : [],
      targetPath: typeof raw.targetPath === 'string' ? this.resolveProjectPath(raw.targetPath) : undefined,
      constraints: Array.isArray(raw.constraints) ? raw.constraints.map(String).map((value) => value.trim()).filter(Boolean).slice(0, 8) : [],
    };
  }

  private validateEntry(entry: RequirementEntry): void {
    const ref = formatWorkflowDataRef(entry.ref);
    if (entry.ref.kind === 'evidence') {
      if (!entry.evidenceKind) throw new Error(`Resolution evidence ${ref} has no evidenceKind`);
      if (entry.requires.length > 0) throw new Error(`Resolution evidence ${ref} cannot depend on other data`);
      return;
    }
    if (entry.ref.kind === 'fact') {
      if (entry.requires.some((dependency) => dependency.kind !== 'evidence')) {
        throw new Error(`Resolution fact ${ref} may depend only on evidence`);
      }
      if (entry.requires.length === 0 && (entry.sourceHints?.length ?? 0) === 0) {
        throw new Error(`Resolution fact ${ref} needs evidence or a source hint`);
      }
      return;
    }
    if (entry.ref.kind === 'change-definition') {
      if (entry.requires.length === 0 || entry.requires.some((dependency) => dependency.kind !== 'fact')) {
        throw new Error(`Resolution change ${ref} must depend on facts`);
      }
      return;
    }
    throw new Error(`Resolution cannot target ${entry.ref.kind}`);
  }

  private requirementText(requirement: StepRequirementContract): string {
    return [
      `ref: ${requirement.ref}`,
      `description: ${requirement.description}`,
      requirement.evidenceKind ? `evidenceKind: ${requirement.evidenceKind}` : '',
      requirement.sourceHints?.length ? `sourceHints: ${requirement.sourceHints.join(', ')}` : '',
      requirement.targetPath ? `targetPath: ${requirement.targetPath}` : '',
      requirement.constraints?.length ? `constraints: ${requirement.constraints.join(', ')}` : '',
    ].filter(Boolean).join('\n');
  }

  private projectCandidateFiles(): string[] {
    return (this.projectSession.currentIndexMy?.files.map((file) => file.path) ?? [])
      .filter((path) => !path.startsWith('test/') && !path.startsWith('doc/') && !path.includes('/test/') && !path.includes('/doc/') && !path.toLowerCase().includes('benchmark'))
      .slice(0, 32);
  }

  private resolveProjectPath(value: string): string | undefined {
    const requested = value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
    if (!requested) return undefined;
    const files = this.projectSession.currentIndexMy?.files.map((file) => file.path.replace(/\\/g, '/')) ?? [];
    if (files.includes(requested)) return requested;
    const lower = requested.toLowerCase();
    const suffix = files.filter((path) => path.toLowerCase().endsWith(`/${lower}`));
    if (suffix.length === 1) return suffix[0];
    const basename = lower.split('/').at(-1);
    if (!basename) return undefined;
    const matches = files.filter((path) => path.toLowerCase().split('/').at(-1) === basename);
    return matches.length === 1 ? matches[0] : undefined;
  }

  private protocol(target: string): string {
    return `Return ONLY JSON:\n{\n  "status": "planned | add-capability | unresolvable",\n  "reason": "short reason",\n  "goal": "small child goal",\n  "root": "${target} for planned; change-definition:stable.support.change for add-capability",\n  "recheck": "${target} (required only for add-capability)",\n  "entries": [\n    {\n      "ref": "workflow:data.ref",\n      "description": "what must be found, known, or minimally changed",\n      "requires": [],\n      "evidenceKind": "file | symbol | definition | usage | reference | example",\n      "sourceHints": ["existing/project/file.ts"],\n      "targetPath": "existing/project/file.ts when ref is change-definition",\n      "constraints": ["preserved semantic constraint"]\n    }\n  ]\n}\nFor status=planned, root MUST equal ${target}. For status=add-capability, recheck MUST equal ${target}, root MUST be change-definition, and the map must describe only one minimal supporting project change. For status=unresolvable, entries may be omitted. Do not return execution steps or tool calls.`;
  }

  private extractJson(content: string): string {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return fenced[1].trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
    throw new Error('Requirement resolution response does not contain JSON');
  }

  private optionalMessage(message: ModelRequest['messages'][number] | undefined): ModelRequest['messages'] {
    return message ? [message] : [];
  }

  private resolveLanguage(description: string): 'ru' | 'en' {
    const cyrillic = (description.match(/[А-Яа-яЁё]/g) ?? []).length;
    const latin = (description.match(/[A-Za-z]/g) ?? []).length;
    return cyrillic > latin ? 'ru' : 'en';
  }
}

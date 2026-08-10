// RequirementPlanner.ts
import type { RequirementEntry, RequirementMap, EvidenceKind } from '@agent/Planning/RequirementMap';
import { formatWorkflowDataRef, parseWorkflowDataRef, type WorkflowDataRef } from '@agent/Planning/WorkflowData';
import type { ModelConfiguration } from '@core/Configuration/Configuration';
import type { Logger } from '@core/Logging/Logger';
import type { Task } from '@core/Task/Task';
import type { ModelAdapter } from '@model/Adapter/ModelAdapter';
import type { ModelCallProfile } from '@model/Profile/ModelCallProfile';
import { composePrompt } from '@model/Prompt/PromptComposer';
import { taskMessage, userMessage } from '@model/Prompt/ModelInputComposer';
import type { ModelRequest } from '@model/Request/ModelRequest';
import { transportMessages } from '@model/Request/ModelMessageTransport';
import type { ProjectSession } from '@project/ProjectSession/ProjectSession';

const REQUIREMENT_PLAN_PROFILE: ModelCallProfile = {
  prompt: {
    purpose: 'Build a compact backward requirement map for a developer task. Describe what must be known before choosing execution steps.',
    rules: [
      'Start from the desired result and work backward to the knowledge required to produce it.',
      'Return data requirements, not Nodus step types or tool calls.',
      'Use evidence for concrete project artifacts that must be located, fact for semantic knowledge derived from evidence, and change-definition for a code change that depends on facts.',
      'A fact describes what must be known by a consumer. Use scope when the access path is context-specific, for example scope=cli.',
      'Use constraints for semantic requirements that must remain true, for example read-only, existing-state, no-side-effects, nullable, or no-duplication.',
      'Evidence may declare only its semantic evidenceKind: file, symbol, definition, usage, reference, or example. Do not choose search/understand operations.',
      'A fact may require only evidence refs. A change-definition may require only fact refs.',
      'Use sourceHints only for paths present in Project candidates. Never invent a path, API, symbol, or identifier.',
      'Use targetPath only when the exact target file is already supported by Project candidates.',
      'Keep the map minimal. Do not duplicate the same knowledge under different keys.',
      'For code-changing tasks the root should be a change-definition. For read-only analysis the root may be a fact or evidence.',
      'The root must reference one entry in the map.',
    ],
  },
  model: { temperature: 0, maxTokens: 1200 },
};

interface RawRequirementEntry {
  ref?: unknown;
  description?: unknown;
  requires?: unknown;
  evidenceKind?: unknown;
  sourceHints?: unknown;
  targetPath?: unknown;
  constraints?: unknown;
}

interface RawRequirementMap {
  goal?: unknown;
  root?: unknown;
  entries?: unknown;
}

const EVIDENCE_KINDS = new Set<EvidenceKind>(['file', 'symbol', 'definition', 'usage', 'reference', 'example']);

export class RequirementPlanner {
  public constructor(
    private readonly configuration: ModelConfiguration,
    private readonly adapter: ModelAdapter,
    private readonly projectSession: ProjectSession,
    private readonly logger: Logger,
  ) {}

  public async generate(task: Task, executionId: string): Promise<RequirementMap> {
    const request: ModelRequest = {
      model: this.configuration.model,
      temperature: REQUIREMENT_PLAN_PROFILE.model.temperature ?? this.configuration.temperature,
      maxTokens: Math.min(this.configuration.maxTokens ?? 1200, REQUIREMENT_PLAN_PROFILE.model.maxTokens ?? 1200),
      messages: transportMessages([
        {
          role: 'system',
          content: composePrompt(REQUIREMENT_PLAN_PROFILE.prompt, { returnFormat: this.protocol() }),
        },
        taskMessage(task.description, task.context),
        userMessage('Project candidates:', [
          `Project ID: ${this.projectSession.projectId}`,
          ...this.plannerCandidateFiles(task.description).map((file) => `- ${file}`),
        ].join('\n')),
      ], this.configuration.messageLayout),
    };

    const response = await this.adapter.complete(request);
    const map = this.parse(response.content);
    await this.logger.info('requirement-map-created', {
      goal: map.goal,
      root: formatWorkflowDataRef(map.root),
      entries: map.entries.map((entry) => ({
        ref: formatWorkflowDataRef(entry.ref),
        description: entry.description,
        requires: entry.requires.map(formatWorkflowDataRef),
        evidenceKind: entry.evidenceKind,
        sourceHints: entry.sourceHints,
        targetPath: entry.targetPath,
        constraints: entry.constraints,
      })),
    }, {
      projectId: task.projectId,
      conversationId: task.conversationId,
      taskId: task.id,
      executionId,
    });
    return map;
  }

  private parse(content: string): RequirementMap {
    const raw = JSON.parse(this.extractJson(content)) as RawRequirementMap;
    if (typeof raw.goal !== 'string' || !raw.goal.trim()) throw new Error('Requirement planner returned no goal');
    if (typeof raw.root !== 'string') throw new Error('Requirement planner returned no root ref');
    if (!Array.isArray(raw.entries) || raw.entries.length === 0) throw new Error('Requirement planner returned no entries');

    const entries = raw.entries.slice(0, 16).map((entry) => this.parseEntry(entry as RawRequirementEntry));
    const keys = entries.map((entry) => formatWorkflowDataRef(entry.ref));
    if (new Set(keys).size !== keys.length) throw new Error('Requirement planner returned duplicate refs');
    const byRef = new Map(entries.map((entry) => [formatWorkflowDataRef(entry.ref), entry]));
    const root = parseWorkflowDataRef(raw.root);
    if (!byRef.has(formatWorkflowDataRef(root))) throw new Error(`Requirement root is not declared: ${raw.root}`);

    for (const entry of entries) {
      const key = formatWorkflowDataRef(entry.ref);
      for (const dependency of entry.requires) {
        const dependencyKey = formatWorkflowDataRef(dependency);
        if (!byRef.has(dependencyKey)) throw new Error(`Requirement ${key} depends on undeclared ${dependencyKey}`);
      }
      this.validateEntry(entry);
    }

    return {
      version: 1,
      goal: raw.goal.trim().slice(0, 300),
      root,
      entries,
    };
  }

  private parseEntry(raw: RawRequirementEntry): RequirementEntry {
    if (typeof raw.ref !== 'string') throw new Error('Requirement entry has no ref');
    if (typeof raw.description !== 'string' || !raw.description.trim()) throw new Error(`Requirement ${raw.ref} has no description`);

    const ref = parseWorkflowDataRef(raw.ref);
    const requires = Array.isArray(raw.requires)
      ? raw.requires.map(String).map((value) => parseWorkflowDataRef(value))
      : [];
    const evidenceKind = typeof raw.evidenceKind === 'string' && EVIDENCE_KINDS.has(raw.evidenceKind as EvidenceKind)
      ? raw.evidenceKind as EvidenceKind
      : undefined;
    const sourceHints = Array.isArray(raw.sourceHints)
      ? raw.sourceHints.map(String).map((path) => this.resolveProjectPath(path)).filter((path): path is string => Boolean(path)).slice(0, 4)
      : [];
    const targetPath = typeof raw.targetPath === 'string' ? this.resolveProjectPath(raw.targetPath) : undefined;
    const constraints = Array.isArray(raw.constraints)
      ? raw.constraints.map(String).map((value) => value.trim()).filter(Boolean).slice(0, 8)
      : [];

    return {
      ref,
      description: raw.description.trim().slice(0, 320),
      requires,
      evidenceKind,
      sourceHints,
      targetPath,
      constraints,
    };
  }

  private validateEntry(entry: RequirementEntry): void {
    const ref = formatWorkflowDataRef(entry.ref);
    if (entry.ref.kind === 'evidence') {
      if (!entry.evidenceKind) throw new Error(`Evidence requirement ${ref} is missing evidenceKind`);
      if (entry.requires.length > 0) throw new Error(`Evidence requirement ${ref} must not depend on other workflow data`);
      return;
    }

    if (entry.ref.kind === 'fact') {
      if (entry.requires.some((dependency) => dependency.kind !== 'evidence')) {
        throw new Error(`Fact requirement ${ref} may depend only on evidence`);
      }
      if (entry.requires.length === 0 && (entry.sourceHints?.length ?? 0) === 0) {
        throw new Error(`Fact requirement ${ref} must be grounded by evidence or a known source hint`);
      }
      return;
    }

    if (entry.ref.kind === 'change-definition') {
      if (entry.requires.length === 0 || entry.requires.some((dependency) => dependency.kind !== 'fact')) {
        throw new Error(`Change requirement ${ref} must depend on one or more facts`);
      }
      return;
    }

    throw new Error(`Requirement planner cannot directly declare ${entry.ref.kind}`);
  }

  private resolveProjectPath(value: string): string | undefined {
    const requested = value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
    if (!requested) return undefined;
    const files = this.projectSession.currentIndexMy?.files.map((file) => file.path.replace(/\\/g, '/')) ?? [];
    if (files.includes(requested)) return requested;

    const normalized = requested.toLowerCase();
    const suffixMatches = files.filter((path) => path.toLowerCase().endsWith(`/${normalized}`));
    if (suffixMatches.length === 1) return suffixMatches[0];

    const basename = normalized.split('/').at(-1);
    if (!basename) return undefined;
    const basenameMatches = files.filter((path) => path.toLowerCase().split('/').at(-1) === basename);
    return basenameMatches.length === 1 ? basenameMatches[0] : undefined;
  }

  private plannerCandidateFiles(description: string): string[] {
    const files = this.projectSession.currentIndexMy?.files.map((file) => file.path) ?? [];
    if (files.length <= 18) return files;

    const lower = description.toLowerCase();
    const expanded = new Set(
      lower.replace(/[^a-zа-яё0-9._/-]+/gi, ' ')
        .split(/\s+/)
        .map((token) => token.replace(/^\/+|\/+$/g, ''))
        .filter((token) => token.length >= 3),
    );
    if (lower.includes('cli') || lower.includes('команд')) for (const token of ['cli', 'command']) expanded.add(token);
    if (lower.includes('project') || lower.includes('проект')) for (const token of ['project', 'configuration', 'nodus', 'projectsession']) expanded.add(token);
    if (lower.includes('conversation') || lower.includes('диалог')) expanded.add('conversation');
    if (lower.includes('index') || lower.includes('индекс')) for (const token of ['index', 'projectsession']) expanded.add(token);
    if (lower.includes('status')) for (const token of ['cli', 'projectsession', 'conversation', 'index']) expanded.add(token);

    const ranked = files.map((path) => {
      const normalized = path.toLowerCase();
      let score = 0;
      for (const token of expanded) if (normalized.includes(token)) score += token.length >= 6 ? 3 : 2;
      if (normalized.includes('/test/') || normalized.includes('benchmark') || normalized.includes('/doc/') || normalized.startsWith('.idea/')) score -= 6;
      return { path, score };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

    const selected = ranked.slice(0, 18).map((item) => item.path);
    return selected.length > 0 ? selected : files.slice(0, 18);
  }

  private extractJson(content: string): string {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return fenced[1].trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
    throw new Error('Requirement planner response does not contain JSON');
  }

  private protocol(): string {
    return `Return ONLY JSON:\n{\n  "goal": "short goal",\n  "root": "evidence:stable.key | fact:stable.key@optional-scope | change-definition:stable.key",\n  "entries": [\n    {\n      "ref": "evidence:stable.key",\n      "description": "what concrete project evidence must be located",\n      "requires": [],\n      "evidenceKind": "file | symbol | definition | usage | reference | example",\n      "sourceHints": ["optional/existing/file.ts"],\n      "constraints": ["optional semantic constraint"]\n    },\n    {\n      "ref": "fact:stable.key@optional-scope",\n      "description": "what semantic knowledge must be established",\n      "requires": ["evidence:stable.key"],\n      "sourceHints": ["optional/existing/file.ts"],\n      "constraints": ["read-only | existing-state | no-side-effects | nullable | other task constraint"]\n    },\n    {\n      "ref": "change-definition:stable.key",\n      "description": "the intended code change",\n      "requires": ["fact:stable.key@optional-scope"],\n      "targetPath": "optional/existing/target.ts",\n      "constraints": ["minimal-change | reuse-existing-api | no-unrelated-changes | other task constraint"]\n    }\n  ]\n}\nOmit constraints when none are needed. Do not return step ids, step types, actions, tools, inputs, outputs, or execution order.`;
  }
}

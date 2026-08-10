// PlanCompiler.ts
import type { RequirementEntry, RequirementMap } from '@agent/Planning/RequirementMap';
import { formatWorkflowDataRef, type WorkflowDataRef } from '@agent/Planning/WorkflowData';
import type { PlanStep, PlanStepAction, PlanStepType, TaskPlan } from '@agent/Planning/TaskPlan';
import type { StepRegistry } from '@agent/Planning/StepRegistry';

export class PlanCompiler {
  public constructor(private readonly stepRegistry: StepRegistry) {}

  public compile(map: RequirementMap, language: 'ru' | 'en'): TaskPlan {
    const entries = new Map(map.entries.map((entry) => [formatWorkflowDataRef(entry.ref), entry]));
    const reachable = this.collectReachable(map.root, entries);
    const steps: PlanStep[] = [];
    let sequence = 1;

    const evidence = reachable.filter((entry) => entry.ref.kind === 'evidence');
    for (const entry of evidence) {
      const action = this.evidenceAction(entry);
      steps.push(this.step(sequence++, 'search', action, this.evidenceSubject(entry), language, [], [formatWorkflowDataRef(entry.ref)]));
    }

    const facts = reachable.filter((entry) => entry.ref.kind === 'fact');
    if (facts.length > 0) {
      const inputKeys = this.uniqueRefs(facts.flatMap((entry) => entry.requires));
      const outputKeys = facts.map((entry) => formatWorkflowDataRef(entry.ref));
      const sourceHints = Array.from(new Set(facts.flatMap((entry) => entry.sourceHints ?? [])));
      const rootEntry = entries.get(formatWorkflowDataRef(map.root));
      if (rootEntry?.targetPath) sourceHints.push(rootEntry.targetPath);
      const subject = this.factSubject(facts, sourceHints);
      const action: PlanStepAction = facts.length === 1 && /pattern/i.test(facts[0].ref.key)
        ? 'identify-pattern'
        : 'determine-integration';
      steps.push(this.step(sequence++, 'understand', action, subject, language, inputKeys, outputKeys));
    }

    const rootEntry = entries.get(formatWorkflowDataRef(map.root));
    if (!rootEntry) throw new Error(`Requirement root is missing: ${formatWorkflowDataRef(map.root)}`);

    let finalInput = formatWorkflowDataRef(map.root);
    if (map.root.kind === 'change-definition') {
      const requires = rootEntry.requires.map(formatWorkflowDataRef);
      steps.push(this.step(sequence++, 'prepare-change', 'define-change', rootEntry.description, language, requires, [finalInput]));

      const changeResult: WorkflowDataRef = { kind: 'change-result', key: map.root.key, scope: map.root.scope };
      const changeResultKey = formatWorkflowDataRef(changeResult);
      const edit = this.step(sequence++, 'edit-file', 'apply-change', rootEntry.description, language, [finalInput], [changeResultKey]);
      if (rootEntry.targetPath) edit.targetPath = rootEntry.targetPath;
      steps.push(edit);
      finalInput = changeResultKey;
    } else if (map.root.kind !== 'fact' && map.root.kind !== 'evidence') {
      throw new Error(`Unsupported requirement root for compiler v1: ${map.root.kind}`);
    }

    const finalRef: WorkflowDataRef = { kind: 'final-result', key: map.root.key, scope: map.root.scope };
    steps.push(this.step(
      sequence++,
      'finalize',
      'summarize-result',
      map.goal,
      language,
      [finalInput],
      [formatWorkflowDataRef(finalRef)],
    ));

    return {
      version: 3,
      goal: map.goal,
      steps,
    };
  }

  private collectReachable(root: WorkflowDataRef, entries: Map<string, RequirementEntry>): RequirementEntry[] {
    const ordered: RequirementEntry[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (ref: WorkflowDataRef): void => {
      const key = formatWorkflowDataRef(ref);
      if (visited.has(key)) return;
      if (visiting.has(key)) throw new Error(`Requirement dependency cycle detected at ${key}`);
      const entry = entries.get(key);
      if (!entry) throw new Error(`Requirement dependency is missing: ${key}`);
      visiting.add(key);
      for (const dependency of entry.requires) visit(dependency);
      visiting.delete(key);
      visited.add(key);
      ordered.push(entry);
    };

    visit(root);
    return ordered;
  }

  private evidenceAction(entry: RequirementEntry): PlanStepAction {
    switch (entry.evidenceKind) {
      case 'file': return 'find-files';
      case 'symbol': return 'find-symbols';
      case 'definition': return 'find-definitions';
      case 'usage': return 'find-usages';
      case 'reference': return 'find-references';
      case 'example': return 'find-examples';
      default: throw new Error(`Evidence requirement ${formatWorkflowDataRef(entry.ref)} has no evidenceKind`);
    }
  }

  private evidenceSubject(entry: RequirementEntry): string {
    const hints = entry.sourceHints ?? [];
    if (hints.length === 0) return entry.description;
    const suffix = hints.length === 1 ? ` in ${hints[0]}` : ` in ${hints.join(', ')}`;
    return entry.description.toLowerCase().includes(hints[0].toLowerCase()) ? entry.description : `${entry.description}${suffix}`;
  }

  private factSubject(entries: RequirementEntry[], sourceHints: string[]): string {
    const knowledge = entries.map((entry) => {
      const scoped = entry.ref.scope ? ` [scope=${entry.ref.scope}]` : '';
      return `${formatWorkflowDataRef(entry.ref)}${scoped}: ${entry.description}`;
    });
    const sources = Array.from(new Set(sourceHints)).filter(Boolean);
    return [
      'Establish the required integration facts from the located evidence.',
      ...knowledge,
      sources.length > 0 ? `Known source files: ${sources.join(', ')}` : '',
    ].filter(Boolean).join(' ');
  }

  private uniqueRefs(refs: WorkflowDataRef[]): string[] {
    return Array.from(new Set(refs.map(formatWorkflowDataRef)));
  }

  private step(
    sequence: number,
    type: PlanStepType,
    action: PlanStepAction,
    subject: string,
    language: 'ru' | 'en',
    inputs: string[],
    outputs: string[],
  ): PlanStep {
    const normalizedAction = this.stepRegistry.normalizeAction(type, action, subject);
    this.stepRegistry.assertDataContract(type, inputs, outputs);
    return {
      id: `step-${sequence}`,
      type,
      action: normalizedAction,
      subject,
      goal: this.stepRegistry.renderGoal(type, normalizedAction, subject, language),
      status: 'pending',
      maxAttempts: this.stepRegistry.limit(type),
      inputs,
      outputs,
    };
  }
}

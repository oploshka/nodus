// PlanCompiler.ts
import type { RequirementEntry, RequirementMap } from '@planner/RequirementMap';
import { formatWorkflowDataRef, type WorkflowDataRef } from '@planner/WorkflowData';
import type { PlanStep, PlanStepAction, PlanStepType, StepRequirementContract, TaskPlan } from '@planner/TaskPlan';
import type { StepRegistry } from '@planner/StepRegistry';

interface CompileOptions {
  includeFinalize: boolean;
  applyChange: boolean;
}

export class PlanCompiler {
  public constructor(private readonly stepRegistry: StepRegistry) {}

  public compile(map: RequirementMap, language: 'ru' | 'en'): TaskPlan {
    return this.compileInternal(map, language, { includeFinalize: true, applyChange: true });
  }

  public compileResolution(map: RequirementMap, language: 'ru' | 'en'): TaskPlan {
    return this.compileInternal(map, language, { includeFinalize: false, applyChange: false });
  }

  public compileCapabilityResolution(map: RequirementMap, language: 'ru' | 'en'): TaskPlan {
    return this.compileInternal(map, language, { includeFinalize: false, applyChange: true });
  }

  private compileInternal(map: RequirementMap, language: 'ru' | 'en', options: CompileOptions): TaskPlan {
    const entries = new Map(map.entries.map((entry) => [formatWorkflowDataRef(entry.ref), entry]));
    const reachable = this.collectReachable(map.root, entries);
    const steps: PlanStep[] = [];
    let sequence = 1;

    const evidence = reachable.filter((entry) => entry.ref.kind === 'evidence');
    for (const entry of evidence) {
      const action = this.evidenceAction(entry);
      const searchStep = this.step(sequence++, 'search', action, this.evidenceSubject(entry), language, [], [formatWorkflowDataRef(entry.ref)]);
      if (entry.sourceHints?.length) searchStep.sourceHints = [...entry.sourceHints];
      searchStep.requirements = [this.contract(entry)];
      steps.push(searchStep);
    }

    const facts = reachable.filter((entry) => entry.ref.kind === 'fact');
    const rootEntry = entries.get(formatWorkflowDataRef(map.root));
    for (const layer of this.factLayers(facts)) {
      const inputKeys = this.uniqueRefs(layer.flatMap((entry) => entry.requires));
      const outputKeys = layer.map((entry) => formatWorkflowDataRef(entry.ref));
      const sourceHints = Array.from(new Set(layer.flatMap((entry) => entry.sourceHints ?? [])));
      const needsTargetRuntime = layer.some((entry) => entry.ref.scope && !entry.requires.some((dependency) => dependency.kind === 'fact'));
      if (needsTargetRuntime && rootEntry?.targetPath) sourceHints.push(rootEntry.targetPath);
      const subject = this.factSubject(layer, sourceHints);
      const action: PlanStepAction = layer.length === 1 && /pattern/i.test(layer[0].ref.key)
        ? 'identify-pattern'
        : 'determine-integration';
      const understand = this.step(sequence++, 'understand', action, subject, language, inputKeys, outputKeys);
      understand.requirements = layer.map((entry) => this.contract(entry));
      understand.sourceHints = Array.from(new Set(sourceHints)).filter(Boolean);
      steps.push(understand);
    }

    if (!rootEntry) throw new Error(`Requirement root is missing: ${formatWorkflowDataRef(map.root)}`);

    let finalInput = formatWorkflowDataRef(map.root);
    if (map.root.kind === 'change-definition') {
      const requires = rootEntry.requires.map(formatWorkflowDataRef);
      const prepare = this.step(sequence++, 'prepare-change', 'define-change', rootEntry.description, language, requires, [finalInput]);
      prepare.requirements = [this.contract(rootEntry)];
      if (rootEntry.targetPath) prepare.targetPath = rootEntry.targetPath;
      steps.push(prepare);

      if (options.applyChange) {
        const changeResult: WorkflowDataRef = { kind: 'change-result', key: map.root.key, scope: map.root.scope };
        const changeResultKey = formatWorkflowDataRef(changeResult);
        const edit = this.step(sequence++, 'edit-file', 'apply-change', rootEntry.description, language, [finalInput], [changeResultKey]);
        if (rootEntry.targetPath) edit.targetPath = rootEntry.targetPath;
        steps.push(edit);
        finalInput = changeResultKey;
      }
    } else if (map.root.kind !== 'fact' && map.root.kind !== 'evidence') {
      throw new Error(`Unsupported requirement root for compiler v1: ${map.root.kind}`);
    }

    if (options.includeFinalize) {
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
    }

    return {
      version: 5,
      goal: map.goal,
      steps,
    };
  }

  private factLayers(facts: RequirementEntry[]): RequirementEntry[][] {
    const remaining = new Map(facts.map((entry) => [formatWorkflowDataRef(entry.ref), entry]));
    const produced = new Set<string>();
    const layers: RequirementEntry[][] = [];
    while (remaining.size > 0) {
      const ready = Array.from(remaining.values()).filter((entry) => entry.requires
        .filter((dependency) => dependency.kind === 'fact')
        .every((dependency) => produced.has(formatWorkflowDataRef(dependency))));
      if (ready.length === 0) throw new Error('Fact dependency cycle detected while compiling semantic layers');
      layers.push(ready);
      for (const entry of ready) {
        const key = formatWorkflowDataRef(entry.ref);
        remaining.delete(key);
        produced.add(key);
      }
    }
    return layers;
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

  private contract(entry: RequirementEntry): StepRequirementContract {
    return {
      ref: formatWorkflowDataRef(entry.ref),
      description: entry.description,
      constraints: entry.constraints ? [...entry.constraints] : undefined,
      evidenceKind: entry.evidenceKind,
      sourceHints: entry.sourceHints ? [...entry.sourceHints] : undefined,
      targetPath: entry.targetPath,
    };
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
    const constraints = entry.constraints?.length ? ` Constraints: ${entry.constraints.join('; ')}.` : '';
    if (hints.length === 0) return `${entry.description}${constraints}`;
    const suffix = hints.length === 1 ? ` in ${hints[0]}` : ` in ${hints.join(', ')}`;
    const subject = entry.description.toLowerCase().includes(hints[0].toLowerCase()) ? entry.description : `${entry.description}${suffix}`;
    return `${subject}${constraints}`;
  }

  private factSubject(entries: RequirementEntry[], sourceHints: string[]): string {
    const knowledge = entries.map((entry) => {
      const scoped = entry.ref.scope ? ` [scope=${entry.ref.scope}]` : '';
      const constraints = entry.constraints?.length ? ` [constraints=${entry.constraints.join(', ')}]` : '';
      return `${formatWorkflowDataRef(entry.ref)}${scoped}${constraints}: ${entry.description}`;
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

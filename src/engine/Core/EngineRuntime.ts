import {
  ENGINE_STEP,
  type sEngineOutput,
  type sEngineSchemaStep,
} from './EngineSchemaTsType.js';
import { EngineSchema } from './EngineSchema.js';
import type {
  iEngineStep,
  sEngineExecutionContext,
  sEngineStepRef,
  tEngineRunDependencies,
  tEngineStepDefinition,
} from './EngineStepInterface.js';
import type {
  sEngineGroupConfig,
  sEngineRegisteredModule,
  sEngineRunResult,
  sEngineTraceEntry,
} from './EngineRuntimeTsType.js';
import type { sEngineConfig } from '../EngineConfigTsType.js';

export class EngineRuntime {
  private readonly groups: Readonly<Record<string, sEngineGroupConfig>>;
  private readonly modules = new Map<string, sEngineRegisteredModule>();
  private readonly rootDefinitions = new Map<tEngineStepDefinition, sEngineRegisteredModule>();
  private trace: sEngineTraceEntry[] = [];

  public constructor(config: sEngineConfig) {
    this.groups = config.groups;
    this.validateGroups();

    for (const [name, definition] of Object.entries(config.modules)) {
      if (this.rootDefinitions.has(definition)) {
        throw new Error(`Engine root module is registered more than once: ${name}`);
      }
      const registered = this.registerModule(name, definition);
      this.rootDefinitions.set(definition, registered);
    }
  }

  public async run(schema: EngineSchema, dependencies: tEngineRunDependencies = {}): Promise<sEngineRunResult> {
    this.trace = [];
    const root = schema.value;
    const output = await this.executeSequence(root, root.data, [], undefined, dependencies);
    return {
      status: output.status,
      output,
      schema,
      trace: [...this.trace],
      reason: output.reason,
    };
  }

  private registerModule(
    name: string,
    definition: tEngineStepDefinition,
    lineage: readonly tEngineStepDefinition[] = [],
  ): sEngineRegisteredModule {
    if (!name.trim()) throw new Error('Engine module name must be non-empty.');
    if (this.modules.has(name)) throw new Error(`Duplicate Engine module name: ${name}`);
    if (lineage.includes(definition)) throw new Error(`Circular Engine module dependency: ${name}`);

    const module = this.resolveDefinition(definition, name);
    const group = module.getGroup();
    if (!group.trim()) throw new Error(`Engine module '${name}' must declare a non-empty group.`);
    if (!this.groups[group]) throw new Error(`Engine module '${name}' references unknown group '${group}'.`);

    const registered = { name, definition, module };
    this.modules.set(name, registered);

    const nextLineage = [...lineage, definition];
    for (const [dependencyName, dependency] of Object.entries(module.getDependencies() ?? {})) {
      if (!dependencyName.trim()) throw new Error(`Engine module '${name}' has an empty dependency name.`);
      this.registerModule(`${name}::${dependencyName}`, dependency, nextLineage);
    }

    return registered;
  }

  private resolveDefinition(definition: tEngineStepDefinition, name: string): iEngineStep {
    const module = typeof definition === 'function' ? new definition() : definition;
    if (!module || typeof module !== 'object') {
      throw new Error(`Engine module '${name}' must be an executable object or zero-argument class.`);
    }
    if (typeof module.getGroup !== 'function') throw new Error(`Engine module '${name}' must expose getGroup().`);
    if (typeof module.getId !== 'function') throw new Error(`Engine module '${name}' must expose getId().`);
    if (typeof module.getDependencies !== 'function') throw new Error(`Engine module '${name}' must expose getDependencies().`);
    if (typeof module.run !== 'function') throw new Error(`Engine module '${name}' must expose run(request, dependencies).`);
    return module;
  }

  private validateGroups(): void {
    for (const [name, group] of Object.entries(this.groups)) {
      if (!name.trim()) throw new Error('Engine group name must be non-empty.');
      if (group.schema === false) continue;
      for (const allowed of group.schema.allowedGroups) {
        if (!this.groups[allowed]) throw new Error(`Engine group '${name}' allows unknown group '${allowed}'.`);
      }
    }
  }

  private async executeSequence(
    sequence: sEngineSchemaStep,
    parentInput: unknown,
    path: number[],
    authorityGroup: string | undefined,
    dependencies: tEngineRunDependencies,
  ): Promise<sEngineOutput> {
    const steps = this.requireSteps(sequence, path);
    this.trace.push({ path: [...path], type: ENGINE_STEP.SEQUENCE, status: 'STARTED' });

    let index = 0;
    while (index < steps.length) {
      const stepNumber = index + 1;
      const step = steps[index];
      if (!step) throw new Error(`Missing step ${stepNumber}.`);

      const context = this.buildContext(sequence, index, parentInput, [...path, stepNumber]);
      const output = await this.executeStep(step, context, [...path, stepNumber], authorityGroup, dependencies);
      step.output = output;

      const transition = step.transition;
      const tailChanged = transition ? this.applyTransition(sequence, stepNumber, transition) : false;
      if (tailChanged && authorityGroup) this.validateReturnedSchema(sequence, authorityGroup);

      if (output.status === 'FAILURE') {
        const currentSteps = this.requireSteps(sequence, path);
        if (!tailChanged || currentSteps.length <= stepNumber) {
          const failed: sEngineOutput = { status: 'FAILURE', reason: output.reason, value: output.value };
          sequence.output = failed;
          this.trace.push({ path: [...path], type: ENGINE_STEP.SEQUENCE, status: 'FAILURE' });
          return failed;
        }
      }

      index += 1;
    }

    const currentSteps = this.requireSteps(sequence, path);
    const lastOutput = currentSteps.at(-1)?.output;
    const completed: sEngineOutput = lastOutput ? { ...lastOutput } : { status: 'SUCCESS' };
    sequence.output = completed;
    this.trace.push({ path: [...path], type: ENGINE_STEP.SEQUENCE, status: completed.status });
    return completed;
  }

  private async executeStep(
    step: sEngineSchemaStep,
    context: sEngineExecutionContext,
    path: number[],
    authorityGroup: string | undefined,
    dependencies: tEngineRunDependencies,
  ): Promise<sEngineOutput> {
    this.validateStepShape(step, path);

    if (step.module) return this.executeModule(step, context, path, dependencies);

    const childInput = step.data ?? this.contextPayload(context);
    return this.executeSequence(step, childInput, path, authorityGroup, dependencies);
  }

  private async executeModule(
    step: sEngineSchemaStep,
    context: sEngineExecutionContext,
    path: number[],
    dependencies: tEngineRunDependencies,
  ): Promise<sEngineOutput> {
    const moduleName = step.module;
    if (!moduleName) throw new Error(`Engine schema step at ${path.join('.')} has no module.`);

    const registered = this.modules.get(moduleName);
    if (!registered) throw new Error(`Unknown Engine module: ${moduleName}`);

    this.trace.push({ path: [...path], module: registered.name, status: 'STARTED' });
    const result = await registered.module.run({
      task: step.data ?? context.parent,
      context,
    }, dependencies);

    let output: sEngineOutput;
    if (result instanceof EngineSchema) {
      const sequence = result.value;
      const group = registered.module.getGroup();
      this.validateReturnedSchema(sequence, group);
      output = await this.executeSequence(
        sequence,
        sequence.data ?? step.data ?? this.contextPayload(context),
        path,
        group,
        dependencies,
      );
    } else {
      output = result;
    }

    this.trace.push({ path: [...path], module: registered.name, status: output.status });
    return output;
  }

  private validateReturnedSchema(sequence: sEngineSchemaStep, groupName: string): void {
    this.validateStepShape(sequence, []);
    if (sequence.module || sequence.steps === null) {
      throw new Error(`Engine group '${groupName}' must return a schema with a step chain.`);
    }

    const group = this.groups[groupName];
    if (!group) throw new Error(`Unknown Engine group: ${groupName}`);
    if (group.schema === false) throw new Error(`Engine group '${groupName}' cannot return schema.`);

    const allowed = new Set(group.schema.allowedGroups);
    this.validateSequenceModules(sequence, groupName, allowed);
  }

  private validateSequenceModules(
    sequence: sEngineSchemaStep,
    ownerGroup: string,
    allowed: ReadonlySet<string>,
  ): void {
    const steps = this.requireSteps(sequence, []);

    for (const step of steps) {
      this.validateStepShape(step, []);

      if (!step.module) {
        this.validateSequenceModules(step, ownerGroup, allowed);
        continue;
      }

      const registered = this.modules.get(step.module);
      if (!registered) throw new Error(`Schema from group '${ownerGroup}' references unknown module '${step.module}'.`);
      const targetGroup = registered.module.getGroup();
      if (!allowed.has(targetGroup)) {
        throw new Error(`Schema from group '${ownerGroup}' cannot call group '${targetGroup}' via module '${step.module}'.`);
      }
    }
  }

  private buildContext(
    sequence: sEngineSchemaStep,
    index: number,
    parentInput: unknown,
    path: number[],
  ): sEngineExecutionContext {
    const steps = this.requireSteps(sequence, path.slice(0, -1));
    const config = steps[index]?.input?.context;
    const selectedSteps: sEngineStepRef[] = [];

    for (const stepNumber of config?.steps ?? []) {
      if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > index) {
        throw new Error(`Step ${index + 1} cannot read unavailable local step ${stepNumber}.`);
      }
      const target = steps[stepNumber - 1];
      if (!target?.output) throw new Error(`Local step ${stepNumber} has no output.`);
      selectedSteps.push({ number: stepNumber, output: target.output });
    }

    const previous = config?.previous && index > 0 ? steps[index - 1]?.output : undefined;

    return {
      parent: config?.parent ? parentInput : undefined,
      previous,
      steps: selectedSteps,
      step: index + 1,
      path,
    };
  }

  private contextPayload(context: sEngineExecutionContext): unknown {
    return {
      parent: context.parent,
      previous: context.previous,
      steps: Object.fromEntries(context.steps.map((ref) => [ref.number, ref.output])),
    };
  }

  private applyTransition(
    sequence: sEngineSchemaStep,
    stepNumber: number,
    transition: NonNullable<sEngineSchemaStep['transition']>,
  ): boolean {
    const steps = this.requireSteps(sequence, []);
    const completedPrefix = steps.slice(0, stepNumber);
    const previousTail = steps.slice(stepNumber);
    transition(sequence, stepNumber);

    const nextSteps = this.requireSteps(sequence, []);
    if (nextSteps.length < stepNumber) throw new Error(`Transition at step ${stepNumber} removed completed steps.`);

    for (let index = 0; index < completedPrefix.length; index += 1) {
      if (nextSteps[index] !== completedPrefix[index]) {
        throw new Error(`Transition at step ${stepNumber} changed completed step ${index + 1}.`);
      }
    }

    const nextTail = nextSteps.slice(stepNumber);
    if (nextTail.length !== previousTail.length) return true;
    return nextTail.some((step, index) => step !== previousTail[index]);
  }

  private validateStepShape(step: sEngineSchemaStep, path: readonly number[]): void {
    const location = path.length > 0 ? path.join('.') : 'root';

    if (step.type !== ENGINE_STEP.SEQUENCE) {
      throw new Error(`Invalid Engine schema step at ${location}: unknown type.`);
    }

    if (step.module) {
      if (!step.module.trim()) throw new Error(`Invalid Engine schema step at ${location}: empty module.`);
      if (step.steps !== null) {
        throw new Error(`Invalid Engine schema step at ${location}: module step must end with steps: null.`);
      }
      return;
    }

    if (step.steps === null) {
      throw new Error(`Invalid Engine schema step at ${location}: steps: null requires a module.`);
    }
  }

  private requireSteps(step: sEngineSchemaStep, path: readonly number[]): sEngineSchemaStep[] {
    if (step.steps === null) {
      const location = path.length > 0 ? path.join('.') : 'root';
      throw new Error(`Engine schema step at ${location} has no step chain.`);
    }
    if (step.steps.length === 0) {
      const location = path.length > 0 ? path.join('.') : 'root';
      throw new Error(`Engine schema step at ${location} has an empty step chain. Use null for a terminal module step.`);
    }
    return step.steps;
  }
}

import {
  ENGINE_STEP,
  type sEngineOutput,
  type sEngineSchemaStep,
} from './EngineSchemaTsType.js';
import { EngineSchema } from './EngineSchema.js';
import type {
  iEngineStep,
  tEngineRunDependencies,
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
  private readonly rootModules = new Set<iEngineStep>();
  private trace: sEngineTraceEntry[] = [];

  public constructor(config: sEngineConfig) {
    this.groups = config.groups;
    this.validateGroups();

    for (const [name, module] of Object.entries(config.modules)) {
      if (this.rootModules.has(module)) {
        throw new Error(`Engine root module is registered more than once: ${name}`);
      }
      this.registerModule(name, module);
      this.rootModules.add(module);
    }
  }

  public async run(schema: EngineSchema, dependencies: tEngineRunDependencies = {}): Promise<sEngineRunResult> {
    this.trace = [];
    const output = await this.executeSequence(schema, schema.value, undefined, [], undefined, dependencies);
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
    module: iEngineStep,
    lineage: readonly iEngineStep[] = [],
  ): sEngineRegisteredModule {
    if (!name.trim()) throw new Error('Engine module name must be non-empty.');
    if (this.modules.has(name)) throw new Error(`Duplicate Engine module name: ${name}`);
    if (lineage.includes(module)) throw new Error(`Circular Engine module dependency: ${name}`);
    if (!module || typeof module !== 'object') {
      throw new Error(`Engine module '${name}' must be an executable object.`);
    }
    if (typeof module.getGroup !== 'function') throw new Error(`Engine module '${name}' must expose getGroup().`);
    if (typeof module.getId !== 'function') throw new Error(`Engine module '${name}' must expose getId().`);
    if (typeof module.getDependencies !== 'function') throw new Error(`Engine module '${name}' must expose getDependencies().`);
    if (typeof module.run !== 'function') throw new Error(`Engine module '${name}' must expose run(step, dependencies).`);

    const group = module.getGroup();
    if (!group.trim()) throw new Error(`Engine module '${name}' must declare a non-empty group.`);
    if (!this.groups[group]) throw new Error(`Engine module '${name}' references unknown group '${group}'.`);

    const registered = { name, module };
    this.modules.set(name, registered);

    const nextLineage = [...lineage, module];
    for (const [dependencyName, dependency] of Object.entries(module.getDependencies())) {
      if (!dependencyName.trim()) throw new Error(`Engine module '${name}' has an empty dependency name.`);
      this.registerModule(`${name}::${dependencyName}`, dependency, nextLineage);
    }

    return registered;
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
    schema: EngineSchema,
    sequence: sEngineSchemaStep[],
    parentInput: unknown,
    path: number[],
    authorityGroup: string | undefined,
    dependencies: tEngineRunDependencies,
  ): Promise<sEngineOutput> {
    this.requireSteps(sequence, path);
    this.trace.push({ path: [...path], type: ENGINE_STEP.SEQUENCE, status: 'STARTED' });

    let index = 0;
    while (index < sequence.length) {
      const stepNumber = index + 1;
      const step = sequence[index];
      if (!step) throw new Error(`Missing step ${stepNumber}.`);

      schema.computeContext(sequence, index, parentInput);
      const output = await this.executeStep(schema, step, [...path, stepNumber], authorityGroup, dependencies);
      step.output = output;

      const transition = step.transition;
      const tailChanged = transition ? this.applyTransition(sequence, stepNumber, transition) : false;
      if (tailChanged && authorityGroup) this.validateReturnedSchema(sequence, authorityGroup);

      if (output.status === 'FAILURE') {
        if (!tailChanged || sequence.length <= stepNumber) {
          const failed: sEngineOutput = { status: 'FAILURE', reason: output.reason, value: output.value };
          this.trace.push({ path: [...path], type: ENGINE_STEP.SEQUENCE, status: 'FAILURE' });
          return failed;
        }
      }

      index += 1;
    }

    const lastOutput = sequence.at(-1)?.output;
    const completed: sEngineOutput = lastOutput ? { ...lastOutput } : { status: 'SUCCESS' };
    this.trace.push({ path: [...path], type: ENGINE_STEP.SEQUENCE, status: completed.status });
    return completed;
  }

  private async executeStep(
    schema: EngineSchema,
    step: sEngineSchemaStep,
    path: number[],
    authorityGroup: string | undefined,
    dependencies: tEngineRunDependencies,
  ): Promise<sEngineOutput> {
    this.validateStepShape(step, path);

    if (step.module) return this.executeModule(step, path, dependencies);

    const steps = step.steps;
    if (steps === null) throw new Error(`Engine schema step at ${path.join('.')} has no step chain.`);
    return this.executeSequence(schema, steps, step.task, path, authorityGroup, dependencies);
  }

  private async executeModule(
    step: sEngineSchemaStep,
    path: number[],
    dependencies: tEngineRunDependencies,
  ): Promise<sEngineOutput> {
    const moduleName = step.module;
    if (!moduleName) throw new Error(`Engine schema step at ${path.join('.')} has no module.`);

    const registered = this.modules.get(moduleName);
    if (!registered) throw new Error(`Unknown Engine module: ${moduleName}`);

    this.trace.push({ path: [...path], module: registered.name, status: 'STARTED' });
    const result = await registered.module.run(step, dependencies);

    let output: sEngineOutput;
    if (result instanceof EngineSchema) {
      const sequence = result.value;
      const group = registered.module.getGroup();
      this.validateReturnedSchema(sequence, group);
      output = await this.executeSequence(result, sequence, undefined, path, group, dependencies);
    } else {
      output = result;
    }

    this.trace.push({ path: [...path], module: registered.name, status: output.status });
    return output;
  }

  private validateReturnedSchema(sequence: sEngineSchemaStep[], groupName: string): void {
    this.requireSteps(sequence, []);

    const group = this.groups[groupName];
    if (!group) throw new Error(`Unknown Engine group: ${groupName}`);
    if (group.schema === false) throw new Error(`Engine group '${groupName}' cannot return schema.`);

    const allowed = new Set(group.schema.allowedGroups);
    this.validateSequenceModules(sequence, groupName, allowed);
  }

  private validateSequenceModules(
    sequence: sEngineSchemaStep[],
    ownerGroup: string,
    allowed: ReadonlySet<string>,
  ): void {
    this.requireSteps(sequence, []);

    for (const step of sequence) {
      this.validateStepShape(step, []);

      if (!step.module) {
        if (step.steps === null) throw new Error(`Schema from group '${ownerGroup}' contains an invalid empty chain.`);
        this.validateSequenceModules(step.steps, ownerGroup, allowed);
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

  private applyTransition(
    sequence: sEngineSchemaStep[],
    stepNumber: number,
    transition: NonNullable<sEngineSchemaStep['transition']>,
  ): boolean {
    const completedPrefix = sequence.slice(0, stepNumber);
    const previousTail = sequence.slice(stepNumber);
    transition(sequence, stepNumber);

    if (sequence.length < stepNumber) throw new Error(`Transition at step ${stepNumber} removed completed steps.`);

    for (let index = 0; index < completedPrefix.length; index += 1) {
      if (sequence[index] !== completedPrefix[index]) {
        throw new Error(`Transition at step ${stepNumber} changed completed step ${index + 1}.`);
      }
    }

    const nextTail = sequence.slice(stepNumber);
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

  private requireSteps(sequence: sEngineSchemaStep[], path: readonly number[]): void {
    if (sequence.length === 0) {
      const location = path.length > 0 ? path.join('.') : 'root';
      throw new Error(`Engine schema at ${location} has an empty step chain.`);
    }
  }
}

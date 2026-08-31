import {
  CORE_MODULE_RESULT,
  CORE_STEP,
  isCoreSequence,
  type sCoreModuleStep,
  type sCoreOutput,
  type sCoreSequence,
  type tCoreStep,
} from './CoreSchema.js';
import type {
  iCoreModule,
  sCoreConfig,
  sCoreExecutionContext,
  sCoreGroupConfig,
  sCoreRegisteredModule,
  sCoreRunResult,
  sCoreStepRef,
  sCoreTraceEntry,
  tCoreModuleDefinition,
} from './CoreTsType.js';

export class CoreRuntime {
  private readonly groups: Readonly<Record<string, sCoreGroupConfig>>;
  private readonly modules = new Map<string, sCoreRegisteredModule>();
  private readonly rootDefinitions = new Map<tCoreModuleDefinition, sCoreRegisteredModule>();
  private readonly start: sCoreRegisteredModule;
  private trace: sCoreTraceEntry[] = [];

  public constructor(config: sCoreConfig) {
    this.groups = config.groups;
    this.validateGroups();

    for (const [name, definition] of Object.entries(config.modules)) {
      if (this.rootDefinitions.has(definition)) {
        throw new Error(`Engine root module is registered more than once: ${name}`);
      }
      const registered = this.registerModule(name, definition);
      this.rootDefinitions.set(definition, registered);
    }

    const start = this.rootDefinitions.get(config.start);
    if (!start) throw new Error('Engine start module must be registered in config.modules.');
    this.start = start;
  }

  public async run(input: unknown): Promise<sCoreRunResult> {
    this.trace = [];
    const schema: sCoreSequence = {
      type: CORE_STEP.SEQUENCE,
      task: input,
      steps: [
        {
          module: this.start.name,
          task: input,
          input: { context: { parent: true } },
        },
      ],
    };

    const output = await this.executeSequence(schema, input, [], undefined);
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
    definition: tCoreModuleDefinition,
    lineage: readonly tCoreModuleDefinition[] = [],
  ): sCoreRegisteredModule {
    if (!name.trim()) throw new Error('Engine module name must be non-empty.');
    if (this.modules.has(name)) throw new Error(`Duplicate Engine module name: ${name}`);
    if (lineage.includes(definition)) {
      throw new Error(`Circular Engine module dependency: ${name}`);
    }

    const module = this.resolveDefinition(definition, name);
    if (!module.group.trim()) throw new Error(`Engine module '${name}' must declare a non-empty group.`);
    if (!this.groups[module.group]) {
      throw new Error(`Engine module '${name}' references unknown group '${module.group}'.`);
    }

    const registered = { name, definition, module };
    this.modules.set(name, registered);

    const nextLineage = [...lineage, definition];
    for (const [dependencyName, dependency] of Object.entries(module.dependencies ?? {})) {
      if (!dependencyName.trim()) {
        throw new Error(`Engine module '${name}' has an empty dependency name.`);
      }
      this.registerModule(`${name}::${dependencyName}`, dependency, nextLineage);
    }

    return registered;
  }

  private resolveDefinition(definition: tCoreModuleDefinition, name: string): iCoreModule {
    const module = typeof definition === 'function' ? new definition() : definition;
    if (!module || typeof module !== 'object') {
      throw new Error(`Engine module '${name}' must be an executable object or zero-argument class.`);
    }
    if (typeof module.group !== 'string') {
      throw new Error(`Engine module '${name}' must expose string group.`);
    }
    if (typeof module.execute !== 'function') {
      throw new Error(`Engine module '${name}' must expose execute(request).`);
    }
    return module;
  }

  private validateGroups(): void {
    for (const [name, group] of Object.entries(this.groups)) {
      if (!name.trim()) throw new Error('Engine group name must be non-empty.');
      if (group.schema === false) continue;
      for (const allowed of group.schema.allowedGroups) {
        if (!this.groups[allowed]) {
          throw new Error(`Engine group '${name}' allows unknown group '${allowed}'.`);
        }
      }
    }
  }

  private async executeSequence(
    sequence: sCoreSequence,
    parentInput: unknown,
    path: number[],
    authorityGroup: string | undefined,
  ): Promise<sCoreOutput> {
    this.trace.push({ path: [...path], type: CORE_STEP.SEQUENCE, status: 'STARTED' });

    let index = 0;
    while (index < sequence.steps.length) {
      const stepNumber = index + 1;
      const step = sequence.steps[index];
      if (!step) throw new Error(`Missing step ${stepNumber}.`);

      const context = this.buildContext(sequence, index, parentInput, [...path, stepNumber]);
      const output = await this.executeStep(step, context, [...path, stepNumber], authorityGroup);
      step.output = output;

      const transition = step.transition;
      const tailChanged = transition ? this.applyTransition(sequence, stepNumber, transition) : false;
      if (tailChanged && authorityGroup) this.validateReturnedSchema(sequence, authorityGroup);

      if (output.status === 'FAILURE') {
        if (!tailChanged || sequence.steps.length <= stepNumber) {
          const failed: sCoreOutput = { status: 'FAILURE', reason: output.reason, value: output.value };
          sequence.output = failed;
          this.trace.push({ path: [...path], type: CORE_STEP.SEQUENCE, status: 'FAILURE' });
          return failed;
        }
      }

      index += 1;
    }

    const lastOutput = sequence.steps.at(-1)?.output;
    const completed: sCoreOutput = lastOutput ? { ...lastOutput } : { status: 'SUCCESS' };
    sequence.output = completed;
    this.trace.push({ path: [...path], type: CORE_STEP.SEQUENCE, status: completed.status });
    return completed;
  }

  private async executeStep(
    step: tCoreStep,
    context: sCoreExecutionContext,
    path: number[],
    authorityGroup: string | undefined,
  ): Promise<sCoreOutput> {
    if (isCoreSequence(step)) {
      const childInput = step.task ?? this.contextPayload(context);
      return this.executeSequence(step, childInput, path, authorityGroup);
    }

    return this.executeModule(step, context, path);
  }

  private async executeModule(
    step: sCoreModuleStep,
    context: sCoreExecutionContext,
    path: number[],
  ): Promise<sCoreOutput> {
    const registered = this.modules.get(step.module);
    if (!registered) throw new Error(`Unknown Engine module: ${step.module}`);

    this.trace.push({ path: [...path], module: registered.name, status: 'STARTED' });
    const result = await registered.module.execute({
      task: step.task ?? context.parent,
      context,
    });

    let output: sCoreOutput;
    switch (result.type) {
      case CORE_MODULE_RESULT.OUTPUT:
        output = result.output;
        break;

      case CORE_MODULE_RESULT.SCHEMA:
        this.validateReturnedSchema(result.schema, registered.module.group);
        step.schema = result.schema;
        output = await this.executeSequence(
          result.schema,
          result.schema.task ?? step.task ?? this.contextPayload(context),
          path,
          registered.module.group,
        );
        break;

      default:
        throw new Error(`Engine module '${registered.name}' returned an unknown result type.`);
    }

    this.trace.push({ path: [...path], module: registered.name, status: output.status });
    return output;
  }

  private validateReturnedSchema(sequence: sCoreSequence, groupName: string): void {
    if (!sequence || sequence.type !== CORE_STEP.SEQUENCE || !Array.isArray(sequence.steps)) {
      throw new Error(`Engine group '${groupName}' returned an invalid SEQUENCE schema.`);
    }

    const group = this.groups[groupName];
    if (!group) throw new Error(`Unknown Engine group: ${groupName}`);
    if (group.schema === false) {
      throw new Error(`Engine group '${groupName}' cannot return schema.`);
    }

    const allowed = new Set(group.schema.allowedGroups);
    this.validateSequenceModules(sequence, groupName, allowed);
  }

  private validateSequenceModules(sequence: sCoreSequence, ownerGroup: string, allowed: ReadonlySet<string>): void {
    for (const step of sequence.steps) {
      if (isCoreSequence(step)) {
        this.validateSequenceModules(step, ownerGroup, allowed);
        continue;
      }

      const registered = this.modules.get(step.module);
      if (!registered) throw new Error(`Schema from group '${ownerGroup}' references unknown module '${step.module}'.`);
      const targetGroup = registered.module.group;
      if (!allowed.has(targetGroup)) {
        throw new Error(`Schema from group '${ownerGroup}' cannot call group '${targetGroup}' via module '${step.module}'.`);
      }
    }
  }

  private buildContext(
    sequence: sCoreSequence,
    index: number,
    parentInput: unknown,
    path: number[],
  ): sCoreExecutionContext {
    const config = sequence.steps[index]?.input?.context;
    const selectedSteps: sCoreStepRef[] = [];

    for (const stepNumber of config?.steps ?? []) {
      if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > index) {
        throw new Error(`Step ${index + 1} cannot read unavailable local step ${stepNumber}.`);
      }
      const target = sequence.steps[stepNumber - 1];
      if (!target?.output) throw new Error(`Local step ${stepNumber} has no output.`);
      selectedSteps.push({ number: stepNumber, output: target.output });
    }

    const previous = config?.previous && index > 0
      ? sequence.steps[index - 1]?.output
      : undefined;

    return {
      parent: config?.parent ? parentInput : undefined,
      previous,
      steps: selectedSteps,
      step: index + 1,
      path,
    };
  }

  private contextPayload(context: sCoreExecutionContext): unknown {
    return {
      parent: context.parent,
      previous: context.previous,
      steps: Object.fromEntries(context.steps.map((ref) => [ref.number, ref.output])),
    };
  }

  private applyTransition(
    sequence: sCoreSequence,
    stepNumber: number,
    transition: NonNullable<sCoreSequence['transition']>,
  ): boolean {
    const completedPrefix = sequence.steps.slice(0, stepNumber);
    const previousTail = sequence.steps.slice(stepNumber);
    transition(sequence, stepNumber);

    if (sequence.steps.length < stepNumber) {
      throw new Error(`Transition at step ${stepNumber} removed completed steps.`);
    }

    for (let index = 0; index < completedPrefix.length; index += 1) {
      if (sequence.steps[index] !== completedPrefix[index]) {
        throw new Error(`Transition at step ${stepNumber} changed completed step ${index + 1}.`);
      }
    }

    const nextTail = sequence.steps.slice(stepNumber);
    if (nextTail.length !== previousTail.length) return true;
    return nextTail.some((step, index) => step !== previousTail[index]);
  }
}

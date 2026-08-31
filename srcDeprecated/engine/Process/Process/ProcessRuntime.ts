import { MODULE_RESULT, STEP } from './ProcessSchema.js';
import { ProcessStepRef } from './Kit/ProcessStepRef.js';
import type {
  iProcessModule,
  sProcessExecutionContext,
  sProcessOutput,
  sProcessRunResult,
  sProcessSchema,
  sProcessSequence,
  sProcessTraceEntry,
  tProcessExecutableStep,
  tProcessStep,
} from './ProcessTsType.js';

export class ProcessRuntime {
  private readonly modules = new Map<STEP, iProcessModule>();
  private trace: sProcessTraceEntry[] = [];

  public constructor(modules: ReadonlyArray<iProcessModule>) {
    for (const module of modules) {
      if (module.type === STEP.SEQUENCE) throw new Error('SEQUENCE is executed by ProcessRuntime, not a module.');
      if (this.modules.has(module.type)) throw new Error(`Duplicate process module: ${module.type}`);
      this.modules.set(module.type, module);
    }
  }

  public async run(schema: sProcessSchema, input?: unknown): Promise<sProcessRunResult> {
    this.trace = [];
    const output = await this.executeSequence(schema, input, []);

    return {
      status: output.status,
      output,
      schema,
      trace: [...this.trace],
      reason: output.reason,
    };
  }

  private async executeSequence(
    sequence: sProcessSequence,
    parentInput: unknown,
    path: number[],
  ): Promise<sProcessOutput> {
    this.trace.push({ path: [...path], type: STEP.SEQUENCE, status: 'STARTED' });

    let index = 0;
    while (index < sequence.steps.length) {
      const stepNumber = index + 1;
      const step = sequence.steps[index];
      if (!step) throw new Error(`Missing step ${stepNumber}.`);

      const context = this.buildContext(sequence, index, parentInput, [...path, stepNumber]);
      const output = await this.executeStep(step, context, [...path, stepNumber]);
      step.output = output;

      const transition = step.transition;
      const tailChanged = transition
        ? this.applyTransition(sequence, stepNumber, transition)
        : false;

      if (output.status === 'FAILURE') {
        if (!tailChanged || sequence.steps.length <= stepNumber) {
          const failed: sProcessOutput = { status: 'FAILURE', reason: output.reason, value: output.value };
          sequence.output = failed;
          this.trace.push({ path: [...path], type: STEP.SEQUENCE, status: 'FAILURE' });
          return failed;
        }
      }

      index += 1;
    }

    const lastOutput = sequence.steps.at(-1)?.output;
    const completed: sProcessOutput = lastOutput ? { ...lastOutput } : { status: 'SUCCESS' };
    sequence.output = completed;
    this.trace.push({ path: [...path], type: STEP.SEQUENCE, status: 'SUCCESS' });
    return completed;
  }

  private async executeStep(
    step: tProcessStep,
    context: sProcessExecutionContext,
    path: number[],
  ): Promise<sProcessOutput> {
    if (step.type === STEP.SEQUENCE) {
      const childInput = step.task ?? this.contextPayload(context);
      return this.executeSequence(step, childInput, path);
    }

    return this.executeModule(step, context, path);
  }

  private async executeModule(
    step: tProcessExecutableStep,
    context: sProcessExecutionContext,
    path: number[],
  ): Promise<sProcessOutput> {
    const module = this.modules.get(step.type);
    if (!module) throw new Error(`Unknown process module: ${step.type}`);

    this.trace.push({ path: [...path], type: step.type, status: 'STARTED' });
    const result = await module.execute(step, context);

    const output = result.type === MODULE_RESULT.OUTPUT
      ? result.output
      : await this.executeReturnedSchema(step, result.schema, context, path);

    this.trace.push({ path: [...path], type: step.type, status: output.status });
    return output;
  }

  private async executeReturnedSchema(
    step: tProcessExecutableStep,
    schema: sProcessSequence,
    context: sProcessExecutionContext,
    path: number[],
  ): Promise<sProcessOutput> {
    step.schema = schema;
    const childInput = schema.task ?? step.task ?? this.contextPayload(context);
    return this.executeSequence(schema, childInput, path);
  }

  private buildContext(
    plan: sProcessSequence,
    index: number,
    parentInput: unknown,
    path: number[],
  ): sProcessExecutionContext {
    const config = plan.steps[index]?.input?.context;
    const selectedSteps: ProcessStepRef[] = [];

    for (const stepNumber of config?.steps ?? []) {
      if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > index) {
        throw new Error(`Step ${index + 1} cannot read unavailable local step ${stepNumber}.`);
      }
      const target = plan.steps[stepNumber - 1];
      if (!target?.output) throw new Error(`Local step ${stepNumber} has no output.`);
      selectedSteps.push(new ProcessStepRef(stepNumber, target));
    }

    const previous = config?.previous && index > 0
      ? plan.steps[index - 1]?.output
      : undefined;

    return {
      parent: config?.parent ? parentInput : undefined,
      previous,
      steps: selectedSteps,
      step: index + 1,
      path,
    };
  }

  private contextPayload(context: sProcessExecutionContext): unknown {
    return {
      parent: context.parent,
      previous: context.previous,
      steps: Object.fromEntries(context.steps.map((ref) => [ref.number, ref.output])),
    };
  }

  private applyTransition(
    plan: sProcessSequence,
    stepNumber: number,
    transition: NonNullable<tProcessStep['transition']>,
  ): boolean {
    const completedPrefix = plan.steps.slice(0, stepNumber);
    const previousTail = plan.steps.slice(stepNumber);
    transition(plan, stepNumber);

    if (plan.steps.length < stepNumber) {
      throw new Error(`Transition at step ${stepNumber} removed completed steps.`);
    }

    for (let index = 0; index < completedPrefix.length; index += 1) {
      if (plan.steps[index] !== completedPrefix[index]) {
        throw new Error(`Transition at step ${stepNumber} changed completed step ${index + 1}.`);
      }
    }

    const nextTail = plan.steps.slice(stepNumber);
    if (nextTail.length !== previousTail.length) return true;
    return nextTail.some((step, index) => step !== previousTail[index]);
  }
}

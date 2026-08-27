import { ProcessScope } from './ProcessScope.js';
import type {
  iProcessModule,
  sProcessAction,
  sProcessModuleResult,
  sProcessNodeRef,
  sProcessRunResult,
  sProcessSchema,
  sProcessSequence,
  sProcessTraceEntry,
  tProcessNode,
} from './ProcessSchema.js';

interface sNodeExecutionResult {
  status: 'completed' | 'failed';
  reason?: string;
}

/**
 * Small schema executor prototype.
 *
 * A schema owns the chain and variable wiring. Core modules only execute one
 * bounded action. A module may return a nested process (Replan is the primary
 * expected case), which is executed as a child of that action.
 */
export class ProcessRuntime {
  private readonly modules = new Map<string, iProcessModule>();
  private trace: sProcessTraceEntry[] = [];

  public constructor(modules: ReadonlyArray<iProcessModule>) {
    for (const module of modules) {
      if (this.modules.has(module.id)) throw new Error(`Duplicate process module: ${module.id}`);
      this.modules.set(module.id, module);
    }
  }

  public async run(
    schema: sProcessSchema,
    initialVariables: Readonly<Record<string, unknown>> = {},
  ): Promise<sProcessRunResult> {
    this.trace = [];
    const rootScope = new ProcessScope(schema.variables, initialVariables);
    const result = await this.executeSequence(schema, rootScope, undefined, false);

    return {
      status: result.status,
      variables: rootScope.snapshot(),
      trace: [...this.trace],
      reason: result.reason,
    };
  }

  private async executeSequence(
    sequence: sProcessSequence,
    parentScope: ProcessScope,
    parent: sProcessNodeRef | undefined,
    createChildScope = true,
  ): Promise<sNodeExecutionResult> {
    const ref: sProcessNodeRef = { id: sequence.id, kind: 'sequence' };
    const scope = createChildScope
      ? new ProcessScope(sequence.variables, parentScope.bind(sequence.input))
      : parentScope;

    this.trace.push({ node: ref, parent, status: 'started' });

    for (const step of sequence.steps) {
      const result = await this.executeNode(step, scope, ref);
      if (result.status === 'failed') {
        this.trace.push({ node: ref, parent, status: 'failed' });
        return result;
      }
    }

    if (createChildScope) {
      for (const [parentKey, childReference] of Object.entries(sequence.output ?? {})) {
        parentScope.set(parentKey, scope.resolve(childReference));
      }
    }

    this.trace.push({ node: ref, parent, status: 'completed' });
    return { status: 'completed' };
  }

  private async executeNode(
    node: tProcessNode,
    scope: ProcessScope,
    parent: sProcessNodeRef,
  ): Promise<sNodeExecutionResult> {
    if (node.kind === 'sequence') return this.executeSequence(node, scope, parent);
    return this.executeAction(node, scope, parent);
  }

  private async executeAction(
    action: sProcessAction,
    scope: ProcessScope,
    parent: sProcessNodeRef,
  ): Promise<sNodeExecutionResult> {
    const ref: sProcessNodeRef = { id: action.id, kind: 'action' };
    const module = this.modules.get(action.use);
    if (!module) throw new Error(`Unknown process module: ${action.use}`);

    this.trace.push({ node: ref, parent, module: module.id, status: 'started' });
    const result = await module.execute(scope.bind(action.input), {
      node: ref,
      parent,
      preset: action.preset,
    });

    if (action.saveAs) scope.set(action.saveAs, result);

    const nested = await this.executeNestedProcess(result, scope, ref);
    if (nested.status === 'failed') {
      this.trace.push({ node: ref, parent, module: module.id, status: 'failed' });
      return nested;
    }

    if (result.status === 'completed') {
      this.trace.push({ node: ref, parent, module: module.id, status: 'completed' });
      return { status: 'completed' };
    }

    this.trace.push({ node: ref, parent, module: module.id, status: 'failed' });
    if (!action.onFailure?.length) return { status: 'failed', reason: result.reason };

    const recovery = await this.executeRecovery(action.onFailure, scope, ref);
    if (recovery.status === 'failed') return recovery;
    return { status: 'completed' };
  }

  private async executeNestedProcess(
    result: sProcessModuleResult,
    scope: ProcessScope,
    parent: sProcessNodeRef,
  ): Promise<sNodeExecutionResult> {
    if (!result.process) return { status: 'completed' };
    return this.executeSequence(result.process, scope, parent);
  }

  private async executeRecovery(
    steps: ReadonlyArray<tProcessNode>,
    scope: ProcessScope,
    parent: sProcessNodeRef,
  ): Promise<sNodeExecutionResult> {
    for (const step of steps) {
      const result = await this.executeNode(step, scope, parent);
      if (result.status === 'failed') return result;
    }
    return { status: 'completed' };
  }
}

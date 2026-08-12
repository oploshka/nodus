import type { ChangeExecutionContext } from '@execution/ChangeExecutionContext';
import type { ChangeState } from '@execution/State/ChangeState';
import type { Worker } from '@execution/Worker/Worker';
import type { ModelController } from '@model/Controller/ModelController';
import type { ToolExecutor } from '@model/Tool/Execution/ToolExecutor';
import type { OperationRegistry } from '@operation/Registry/OperationRegistry';

export class EditProposalWorker implements Worker<ChangeState, ChangeExecutionContext> {
  public readonly id = 'edit-proposal';

  public constructor(
    private readonly modelController: ModelController,
    private readonly toolExecutor: ToolExecutor,
    private readonly operationRegistry: OperationRegistry,
  ) {}

  public async execute(state: ChangeState, context: ChangeExecutionContext): Promise<ChangeState> {
    const operation = this.operationRegistry.get('edit-file');
    if (!operation) throw new Error('edit-file operation is not available');

    let targetContext = state.targetContext;
    let authoritativeSource = state.authoritativeSource;

    if (targetContext && targetContext.length > 0) {
      context.execution.setToolContext(targetContext, 1);
    } else {
      const call = { tool: 'file-system', input: { action: 'read', path: state.work.targetPath } };
      await this.toolExecutor.execute([call], context.execution, context.logContext, 1);
      targetContext = [...context.execution.getToolContext()];
      const read = targetContext.find((entry) => (
        entry.call.tool === 'file-system'
        && entry.call.input.action === 'read'
        && entry.call.input.path === state.work.targetPath
      ));
      if (read?.result.ok && typeof read.result.data === 'string') authoritativeSource = read.result.data;
    }

    const result = await this.modelController.execute({
      task: context.task,
      execution: context.execution,
      conversation: context.conversation,
      operation,
      activeStep: {
        id: state.work.id,
        type: 'edit-file',
        action: state.work.action,
        subject: state.work.subject,
        goal: state.work.goal,
        attempt: state.attempt,
        maxAttempts: state.work.maxAttempts,
        retryReason: state.retryReason,
        inputs: state.work.inputs,
        outputs: state.work.outputs,
        targetPath: state.work.targetPath,
        sourceHints: state.work.sourceHints,
        requirements: state.work.requirements,
      },
      stepContext: {
        facts: state.facts,
        missingInputs: [],
        activeEvidence: context.activeEvidence,
      },
    });

    if (result.status === 'failed') {
      throw new Error(result.message ?? 'edit-file proposal failed');
    }
    if (result.toolCalls.length > 0) {
      throw new Error(`edit-file is tool-free; target ${state.work.targetPath} is already supplied`);
    }
    if (result.changes.length === 0) {
      throw new Error('edit-file produced no change proposal');
    }

    return {
      ...state,
      phase: 'proposed',
      retryReason: undefined,
      lastError: undefined,
      proposal: result.changes,
      authoritativeSource,
      targetContext,
    };
  }
}

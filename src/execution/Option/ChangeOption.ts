import type { ExecutionOption } from '@execution/Option/ExecutionOption';
import type { ChangeState } from '@execution/State/ChangeState';

export type ChangeOptionId = 'propose-change' | 'prepare-candidate' | 'validate-candidate' | 'commit-candidate';

const OPTIONS: ReadonlyArray<ExecutionOption<ChangeState>> = [
  {
    id: 'propose-change',
    workerId: 'edit-proposal',
    isAvailable: (state) => state.phase === 'ready' && state.attempt < state.work.maxAttempts,
  },
  {
    id: 'prepare-candidate',
    workerId: 'change-prepare',
    isAvailable: (state) => state.phase === 'proposed' && Boolean(state.proposal?.length),
  },
  {
    id: 'validate-candidate',
    workerId: 'change-validation',
    isAvailable: (state) => state.phase === 'prepared' && Boolean(state.prepared?.length),
  },
  {
    id: 'commit-candidate',
    workerId: 'change-commit',
    isAvailable: (state) => state.phase === 'validated' && Boolean(state.prepared?.length),
  },
];

export class ChangeOptionResolver {
  public next(state: ChangeState): ExecutionOption<ChangeState> | undefined {
    return OPTIONS.find((option) => option.isAvailable(state));
  }

  public available(state: ChangeState): ReadonlyArray<ExecutionOption<ChangeState>> {
    return OPTIONS.filter((option) => option.isAvailable(state));
  }
}

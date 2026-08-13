import type { EditPreparationContext, EditPrepareResult, EditStrategyId } from '@engine/Edit/EditTypes.js';

/** One technical serialization/apply strategy owned by the Engine Edit layer. */
export interface EditStrategy {
  readonly id: EditStrategyId;
  prepare(context: EditPreparationContext): Promise<EditPrepareResult>;
}

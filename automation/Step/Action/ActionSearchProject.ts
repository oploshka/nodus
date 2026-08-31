import { FindFileAction } from './ActionFindFile.js';
import type { sFindFileActionInput } from './ActionFindFile.js';

/** @deprecated Use FindFileAction. SearchProjectAction is kept only for compatibility with older harnesses. */
export class SearchProjectAction extends FindFileAction {}

/** @deprecated Use sFindFileActionInput. */
export type sSearchProjectActionInput = sFindFileActionInput;

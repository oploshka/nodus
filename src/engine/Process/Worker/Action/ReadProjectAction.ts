import { ReadFileAction } from './ReadFileAction.js';
import type { sReadFileActionInput } from './ReadFileAction.js';

/** @deprecated Use ReadFileAction. ReadProjectAction is kept only for compatibility with older harnesses. */
export class ReadProjectAction extends ReadFileAction {}

/** @deprecated Use sReadFileActionInput. */
export type sReadProjectActionInput = sReadFileActionInput;

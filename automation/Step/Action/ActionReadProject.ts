import { ReadFileAction} from "@automation/Step/Action/ActionReadFile.js";
import type { sReadFileActionInput} from "@automation/Step/Action/ActionReadFile.js";

/** @deprecated Use ReadFileAction. ReadProjectAction is kept only for compatibility with older harnesses. */
export class ReadProjectAction extends ReadFileAction {}

/** @deprecated Use sReadFileActionInput. */
export type sReadProjectActionInput = sReadFileActionInput;

import type { sCoreModuleRequest } from '@engine/Core/CoreTsType.js';
import type { sCoreOutput, sCoreSequence } from '@engine/Core/CoreSchema.js';

export interface sWorkerRequest extends sCoreModuleRequest {}
export interface sWorkerOutput extends sCoreOutput {}
export interface sWorkerSchema extends sCoreSequence {}

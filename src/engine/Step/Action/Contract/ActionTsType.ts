import type { sCoreModuleRequest } from '@engine/Core/CoreTsType.js';
import type { sCoreOutput, sCoreSequence } from '@engine/Core/CoreSchema.js';

export interface sActionRequest extends sCoreModuleRequest {}
export interface sActionOutput extends sCoreOutput {}
export interface sActionSchema extends sCoreSequence {}

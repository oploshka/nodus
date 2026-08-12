import type { PromptSettings } from '../Profile/ModelCallProfile.js';
import { COMMON_SYSTEM_PROMPT } from './CommonSystemPrompt.js';

export interface PromptComposeOverrides {
  rules?: string[];
  contextRules?: string[];
  returnFormat?: string;
}

export function composePrompt(settings: PromptSettings, overrides: PromptComposeOverrides = {}): string {
  const blocks: string[] = [];
  const identity = settings.identity?.trim() || COMMON_SYSTEM_PROMPT;
  if (identity) blocks.push(identity);
  if (settings.purpose.trim()) blocks.push(`Purpose: ${settings.purpose.trim()}`);

  const rules = [...settings.rules, ...(overrides.rules ?? [])].filter((value) => value.trim());
  if (rules.length > 0) blocks.push(`Rules:
${rules.map((value) => `- ${value.trim()}`).join('\n')}`);

  const contextRules = [...(settings.contextRules ?? []), ...(overrides.contextRules ?? [])].filter((value) => value.trim());
  if (contextRules.length > 0) blocks.push(`Context rules:
${contextRules.map((value) => `- ${value.trim()}`).join('\n')}`);

  const returnFormat = overrides.returnFormat ?? settings.returnFormat;
  if (returnFormat?.trim()) blocks.push(`Return format:
${returnFormat.trim()}`);
  return blocks.join('\n\n');
}

// PromptComposer.ts
import type { PromptSettings } from '@model/Profile/ModelCallProfile';
import { COMMON_SYSTEM_PROMPT } from '@model/Prompt/CommonSystemPrompt';

export interface PromptComposeOverrides {
  rules?: string[];
  contextRules?: string[];
  returnFormat?: string;
}

export function composePrompt(
  settings: PromptSettings,
  overrides: PromptComposeOverrides = {},
): string {
  const blocks: string[] = [];
  const identity = settings.identity?.trim() || COMMON_SYSTEM_PROMPT;
  if (identity) blocks.push(identity);

  if (settings.purpose.trim()) {
    blocks.push(`Purpose: ${settings.purpose.trim()}`);
  }

  const rules = [...settings.rules, ...(overrides.rules ?? [])].filter((value) => value.trim());
  if (rules.length > 0) {
    blocks.push(`Rules:\n${rules.map((value) => `- ${value.trim()}`).join('\n')}`);
  }

  const contextRules = [...(settings.contextRules ?? []), ...(overrides.contextRules ?? [])]
    .filter((value) => value.trim());
  if (contextRules.length > 0) {
    blocks.push(`Context rules:\n${contextRules.map((value) => `- ${value.trim()}`).join('\n')}`);
  }

  const returnFormat = overrides.returnFormat ?? settings.returnFormat;
  if (returnFormat?.trim()) {
    blocks.push(`Return format:\n${returnFormat.trim()}`);
  }

  return blocks.join('\n\n');
}

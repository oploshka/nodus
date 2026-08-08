// PromptRegistry.ts
import { COMMON_SYSTEM_PROMPT } from '@model/Prompt/CommonSystemPrompt';
import { DEFAULT_PROMPT_DEFINITIONS } from '@model/Prompt/DefaultPromptDefinitions';
import type { PromptProfile } from '@model/Profile/PromptProfile';

export class PromptRegistry {
  private readonly profiles = new Map<string, PromptProfile>();

  public constructor() {
    for (const definition of DEFAULT_PROMPT_DEFINITIONS) {
      this.profiles.set(definition.id, { ...definition, systemPrompt: COMMON_SYSTEM_PROMPT });
    }
  }

  public get(id: string): PromptProfile {
    const profile = this.profiles.get(id);
    if (!profile) throw new Error(`Prompt profile not found: ${id}`);
    return profile;
  }

  public register(profile: PromptProfile): void {
    this.profiles.set(profile.id, profile);
  }
}

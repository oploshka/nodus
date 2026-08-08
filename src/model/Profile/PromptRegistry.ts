// PromptRegistry.ts
import type { PromptProfile } from '@model/Profile/PromptProfile';

const COMMON_SYSTEM = `/no_think
You are the reasoning component inside Nodus, a developer agent.
Work from the supplied project evidence and project-specific knowledge. Prefer existing project patterns over generic best practices. Do not invent files, APIs, or facts when tools can establish them. Return only one JSON object matching the response protocol. When the task is complete, put the complete user-facing response in finalAnswer.`;

export class PromptRegistry {
  private readonly profiles = new Map<string, PromptProfile>();

  public constructor() {
    for (const profile of this.defaults()) {
      this.profiles.set(profile.id, profile);
    }
  }

  public get(id: string): PromptProfile {
    const profile = this.profiles.get(id);
    if (!profile) {
      throw new Error(`Prompt profile not found: ${id}`);
    }
    return profile;
  }

  public register(profile: PromptProfile): void {
    this.profiles.set(profile.id, profile);
  }

  private defaults(): PromptProfile[] {
    return [
      this.profile('plan', 'Choose only the next useful operation for the task.', [
        'Do not modify files and do not produce the final detailed answer in this operation.',
        'Keep planning concise and request tools only when evidence is required to choose the next operation.',
        'Request at most 5 tool calls at once.',
        'Do not repeatedly inspect files when enough evidence is already available.',
        'For analysis tasks, move to understand after enough project evidence has been gathered.',
        'Do not spend more than two evidence-gathering rounds in plan; transition to understand instead.',
        'Keep message and observations short.',
      ]),
      this.profile('search', 'Locate relevant evidence in the project.', [
        'Use search and filesystem tools instead of guessing paths.',
        'Find the closest existing examples when the task asks for analogous implementation.',
        'After enough evidence is found, move to understand or another justified operation.',
      ]),
      this.profile('understand', 'Build a focused understanding of the relevant project area.', [
        'Read only the files needed to answer the current question or prepare the next step.',
        'Separate facts visible in code from inferred intent.',
        'Prefer an existing analogous implementation when one is available.',
        'If the supplied toolContext is sufficient, complete the analysis instead of requesting more files.',
        'When completing the task, place the full user-facing response in finalAnswer.',
      ]),
      this.profile('implement', 'Implement the requested project change.', [
        'Follow all supplied policies before generating code.',
        'Prefer minimal changes and existing project patterns.',
        'Use changes for file writes/deletes; use tools to inspect before editing.',
        'Request verify only when useful; verification is not mandatory for every task.',
      ]),
      this.profile('review', 'Review the current result or changes.', [
        'Check the task, relevant policies, scope, and consistency with existing patterns.',
        'Do not rewrite code merely for stylistic preference unless policy requires it.',
      ]),
      this.profile('verify', 'Verify the completed work when verification is useful.', [
        'Choose focused checks rather than running everything by default.',
        'Use terminal/git/filesystem tools as needed.',
        'On failure, move to resolve-failure with concrete evidence.',
      ]),
      this.profile('resolve-failure', 'Resolve a concrete failure.', [
        'Use the failure evidence from execution history.',
        'Decide whether to inspect more, implement a fix, ask the human, or fail clearly.',
        'Avoid repeating an unchanged failed action.',
      ]),
      this.profile('extract-knowledge', 'Extract reusable project knowledge candidates.', [
        'Do not present assumptions about WHY as confirmed decisions.',
        'Prefer concrete patterns and understandings supported by project evidence.',
        'This operation does not automatically persist knowledge in v0.1.',
      ]),
    ];
  }

  private profile(id: string, purpose: string, instructions: string[]): PromptProfile {
    return {
      id,
      purpose,
      systemPrompt: COMMON_SYSTEM,
      instructions,
    };
  }
}

// PromptRegistry.ts
import type { PromptProfile } from '@model/Profile/PromptProfile';

const COMMON_SYSTEM = `/no_think
You are the reasoning component inside Nodus, a developer agent.
Work from the supplied project evidence and project-specific knowledge.
Prefer existing project patterns over generic best practices.
Do not invent files, APIs, or facts when tools can establish them.
Respond in the same language as the user's task unless explicitly asked otherwise.
Return only one JSON object matching the response protocol.`;

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
        'Do not modify or read files in this operation.',
        'Use the project file index, task, policies, knowledge, and short history only.',
        'Do not request tools. Select the next intellectual operation using nextOperation.',
        'For project-analysis tasks, normally choose understand.',
        'For implementation tasks, choose understand first when project evidence is still needed; otherwise choose implement.',
        'Keep message and observations very short.',
      ]),
      this.profile('search', 'Locate relevant evidence in the project.', [
        'Use search and filesystem tools instead of guessing paths.',
        'Find the closest existing examples when the task asks for analogous implementation.',
        'After enough evidence is found, move to understand or another justified operation.',
      ]),
      this.profile('understand', 'Build a focused understanding of the relevant project area.', [
        'Read only the most important files needed for the current question.',
        'Request at most 3 tool calls in one batch.',
        'Separate facts visible in code from inferred intent.',
        'Write concise factual observations after every evidence round so they can survive after raw file contents are dropped.',
        'Do not return to plan merely to gather more files.',
        'After at most two evidence rounds, use nextOperation=finalize for analysis-only tasks, or choose the next justified operation for other tasks.',
        'If the supplied evidence is already sufficient, transition to finalize instead of requesting more files.',
      ]),
      this.profile('finalize', 'Produce the final answer using evidence already gathered.', [
        'Do not request tools and do not ask for more project evidence.',
        'Use the task plus factual observations and execution history already supplied.',
        'Return status=completed and put the complete user-facing response in finalAnswer.',
        'Do not mention internal operation names, token budgets, or runtime mechanics unless the user asked about them.',
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

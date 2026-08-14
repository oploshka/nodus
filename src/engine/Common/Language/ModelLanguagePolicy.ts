import type { LanguageConfiguration } from '@engine/Type/LanguageConfiguration.js';

/**
 * Shared language guidance for model-facing boundaries.
 *
 * Language is selected by the consumer of generated data, not by a field name:
 * Nodus orchestration -> nodus, project-authored text -> project, direct user text -> response.
 */
export class ModelLanguagePolicy {
  public constructor(private readonly language: LanguageConfiguration) {}

  public static nodus(language: string): string {
    return `Use ${language} for all machine-facing Nodus fields and internal orchestration output. Preserve code identifiers, paths and source text exactly.`;
  }

  public static project(language: string): string {
    return `Use ${language} for new human-authored project text such as documentation and comments, unless the task explicitly requests another language.`;
  }

  public static response(language: string): string {
    return `Use ${language} only for text whose direct consumer is the user.`;
  }

  public nodus(): string { return ModelLanguagePolicy.nodus(this.language.nodus); }
  public project(): string { return ModelLanguagePolicy.project(this.language.project); }
  public response(): string { return ModelLanguagePolicy.response(this.language.response); }
  public mixedProjectEdit(): string[] { return [this.nodus(), this.project()]; }
}

export interface LanguageConfiguration {
  /** Primary language used by the project for human-authored text such as docs/comments. */
  project: string;
  /** Internal machine-facing language used by Planner/Research/Worker/Determine. */
  nodus: string;
  /** Language used for user-facing summaries, errors and interactions. */
  response: string;
}

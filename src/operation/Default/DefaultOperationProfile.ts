// DefaultOperationProfile.ts
import type { PromptSettings } from '@model/Profile/ModelCallProfile';
import { OPERATION_RESULT_RETURN_FORMAT } from '@model/Protocol/OperationResultProtocol';
import type { OperationProfile, OperationExecutionSettings } from '@operation/Profile/OperationProfile';

function jsonPrompt(purpose: string, rules: string[]): PromptSettings {
  return { purpose, rules, returnFormat: OPERATION_RESULT_RETURN_FORMAT };
}


const SEARCH_RETRIEVAL_RETURN_FORMAT = `Return ONLY valid JSON:
{
  "status": "continue | failed",
  "message": "short retrieval note",
  "data": { "queries": ["one to four literal search terms"] }
}
Use status=continue when proposing query terms. Do not return toolCalls. Nodus compiles the queries into retrieval tool calls and completes the step deterministically when concrete results exist.`;

function execution(
  contextStrategy: string,
  policyScopes: string[],
  settings: Omit<OperationExecutionSettings, 'contextStrategy' | 'policyScopes'> = {},
): OperationExecutionSettings {
  return { contextStrategy, policyScopes, ...settings };
}

export const DEFAULT_OPERATION_PROFILES: OperationProfile[] = [
  {
    id: 'plan',
    description: 'Choose the next useful intellectual operation for the task without reading or changing files.',
    prompt: jsonPrompt('Choose only the next useful operation for the task.', [
      'Do not modify or read files in this operation.',
      'Use the project file index, task, policies, knowledge, and short history only.',
      'Do not request tools. Classify the task intent as read or write, then select the next intellectual operation using nextOperation.',
      'For project-analysis tasks, normally choose understand.',
      'For implementation tasks, choose understand first when project evidence is still needed; otherwise choose implement.',
      'Keep message and observations very short.',
    ]),
    model: { temperature: 0 },
    execution: execution('planning', ['architecture', 'project'], {
      costWeight: 1,
      allowedTransitions: ['search', 'understand', 'implement', 'finalize'],
      fallback: 'understand',
    }),
    enabled: true,
  },
  {
    id: 'search',
    description: 'Locate concrete project files, symbols, definitions, usages, references, or examples.',
    prompt: {
      purpose: 'Choose literal retrieval query terms for the active search action and subject.',
      rules: [
        'Treat activeStep.action + activeStep.subject as the complete search request.',
        'Allowed search actions are find-files, find-symbols, find-definitions, find-usages, find-references, and find-examples. Work only on the declared action.',
        'Nodus owns tool selection and exact tool input schemas. Never return raw tool calls or choose file-system/search parameters.',
        'Use source hints, project context, and previous empty retrieval evidence to propose one to four short literal query terms likely to occur in the target source.',
        'Prefer concrete identifiers already supported by the request or supplied project context. Do not invent APIs or paths.',
        'Search completion is deterministic: concrete retrieval results complete the step; semantic interpretation belongs to later understand steps.',
      ],
      returnFormat: SEARCH_RETRIEVAL_RETURN_FORMAT,
    },
    model: { temperature: 0 },
    execution: execution('search', ['project'], {
      costWeight: 1,
      allowedTransitions: ['search', 'understand', 'implement', 'finalize'],
      fallback: 'understand',
    }),
    enabled: true,
  },
  {
    id: 'understand',
    description: 'Understand existing code, responsibilities, dependencies, and project behavior.',
    prompt: {
      purpose: 'Build a focused understanding required by the current plan step.',
      rules: [
        'Work only on the ACTIVE plan-step contract. First use supplied known facts and evidence; do not request a file merely to reconfirm a fact already supplied.',
        'Search has already located candidate files. Understand may read only those known/referenced files when source text is genuinely required; do not start a new broad project search.',
        'Read only the most important files needed for the current question and request at most 3 reads in one batch.',
        'Separate facts visible in code from inferred intent.',
        'Write concise factual observations after every evidence round so they can survive after raw file contents are dropped.',
        'Do not broaden the active goal merely to gather more files.',
        'After each evidence round, summarize what is known and publish reusable results under the exact activeStep.outputs keys.',
        'Preserve concrete receiver chains and source scope from supplied evidence; do not replace configuration.project.id with state.task.projectId, nodus.projectSession with this.index, or otherwise substitute a different access path without direct evidence.',
        'An integration access path may compose a runtime receiver visible in the target source with public members established by supplied evidence. The complete expression does not need to already exist in the target file; do not report it missing merely because the requested integration has not been implemented yet.',
        'Preserve member optionality exactly as declared by evidence. Use optional chaining only when the receiver/member is shown as nullable or optional; do not add optional chaining to a required downstream member.',
        'Treat requirement constraints as part of the fact contract, not as advice. A candidate that violates read-only, existing-state, no-side-effects, nullable, must-not-scan-or-refresh, or another supplied constraint cannot satisfy that output.',
        'Do not replace read access to existing state with an operation that creates, refreshes, scans, mutates, or otherwise changes that state. If no compliant access path is supported by evidence, return the exact output key in MISSING instead of inventing a workaround.',
        'If the supplied facts/evidence are sufficient for the active goal, derive the requested outputs and mark the goal satisfied instead of requesting more files.',
        'Use the supplied RAW response protocol. Do not serialize understand results or source-read requests as JSON.',
      ],
    },
    model: { temperature: 0 },
    execution: execution('understanding', ['architecture', 'project'], {
      costWeight: 2,
      allowedTransitions: ['understand', 'prepare-change', 'implement', 'review', 'finalize'],
    }),
    enabled: true,
  },
  {
    id: 'finalize',
    description: 'Produce the final user-facing answer from evidence and observations already gathered.',
    prompt: jsonPrompt('Produce the final answer using evidence already gathered.', [
      'Do not request tools and do not ask for more project evidence.',
      'Use the task plus factual observations and execution history already supplied.',
      'Return status=completed and put the complete user-facing response in finalAnswer.',
      'The finalAnswer must be entirely in the requested response language. Do not answer in English when the response language is ru; English is allowed only for source-code identifiers, file paths, API names, and other technical identifiers.',
      'Do not mention internal operation names, token budgets, or runtime mechanics unless the user asked about them.',
    ]),
    model: { temperature: 0.2 },
    execution: execution('finalization', ['architecture', 'project', 'review'], {
      costWeight: 2,
      allowedTransitions: [],
    }),
    enabled: true,
  },
  {
    id: 'implement',
    description: 'Implement the requested change using existing project patterns and policies.',
    prompt: jsonPrompt('Implement the requested project change.', [
      'Follow all supplied policies before generating code.',
      'Prefer minimal changes and existing project patterns.',
      'Use changes for file writes/deletes; use tools to inspect before editing.',
      'Request verify only when useful; verification is not mandatory for every task.',
    ]),
    model: { temperature: 0 },
    execution: execution('implementation', ['code', 'typescript', 'vue', 'api', 'form', 'entity'], {
      costWeight: 4,
      allowedTransitions: ['implement', 'review', 'verify', 'finalize', 'resolve-failure'],
      fallback: 'understand',
    }),
    enabled: true,
  },
  {
    id: 'prepare-change',
    description: 'Prepare a concrete per-file change plan from gathered evidence without editing files.',
    prompt: jsonPrompt('Prepare the exact file-level change before editing.', [
      'Work only on the ACTIVE plan-step goal.',
      'Use the established active-step facts, their provenance, and supplied requirement constraints to identify the minimum files and edits required.',
      'Do not emit file changes and do not search broadly in this operation.',
      'Return stepResult.goalSatisfied=true only when the target files and exact intended modifications are concrete. Put every exact relative target file path in stepResult.targets and publish the compact change plan under the exact activeStep.outputs key.',
      'Use exact access paths already established by facts/evidence. Do not upgrade a direct property access into a hypothetical getter/service or substitute a different receiver.',
      'If required knowledge is missing, return goalSatisfied=false and list the exact typed fact/evidence refs in stepResult.missing; requirement resolution handles those contracts before generic recovery.',
    ]),
    model: { temperature: 0 },
    execution: execution('implementation', ['code', 'architecture', 'project'], {
      costWeight: 2,
      allowedTransitions: ['edit-file', 'understand', 'finalize', 'resolve-failure'],
      fallback: 'understand',
    }),
    enabled: true,
  },
  {
    id: 'edit-file',
    description: 'Apply a prepared change to concrete project files with minimal scope.',
    prompt: {
      purpose: 'Perform one concrete file edit described by the prepared change plan.',
      rules: [
        'Edit exactly the activeStep.targetPath file and no other file.',
        'The runtime preloads activeStep.targetPath before the edit call and provides it as the authoritative target source.',
        'Do not request tools or another file read during edit-file. Missing project understanding belongs in prepare-change/understand, not in the edit loop.',
        'Use the supplied target-file content as authoritative current source. Do not re-plan the task and do not edit a second file in the same response.',
        'Prefer minimal changes and preserve unrelated content.',
        'For a write, return the complete resulting file content. For a delete, return ACTION delete.',
      ],
    },
    model: { temperature: 0 },
    execution: execution('implementation', ['code', 'typescript', 'vue', 'api', 'form', 'entity'], {
      costWeight: 4,
      allowedTransitions: ['edit-file', 'review', 'verify', 'finalize', 'resolve-failure'],
      fallback: 'prepare-change',
    }),
    enabled: true,
  },
  {
    id: 'review',
    description: 'Review current changes for correctness, scope, consistency, and policy compliance.',
    prompt: jsonPrompt('Review the current result or changes.', [
      'Check only the ACTIVE review goal, relevant policies, scope, and consistency with existing patterns.',
      'Return stepResult with concrete findings/evidence and explicit missing blockers.',
      'Do not rewrite code merely for stylistic preference unless policy requires it.',
    ]),
    model: { temperature: 0 },
    execution: execution('review', ['review', 'architecture', 'code'], {
      costWeight: 2,
      allowedTransitions: ['edit-file', 'implement', 'verify', 'finalize', 'resolve-failure'],
      fallback: 'understand',
    }),
    enabled: true,
  },
  {
    id: 'verify',
    description: 'Optionally verify the result using appropriate deterministic checks and focused review.',
    prompt: jsonPrompt('Verify the completed work when verification is useful.', [
      'Work only on the ACTIVE verification goal.',
      'Choose focused checks rather than running everything by default.',
      'Use terminal/git/filesystem tools as needed.',
      'Return stepResult with the verification outcome and concrete evidence.',
    ]),
    model: { temperature: 0 },
    execution: execution('verification', ['testing', 'review', 'code'], {
      costWeight: 2,
      allowedTransitions: ['finalize', 'implement', 'resolve-failure'],
      fallback: 'resolve-failure',
    }),
    enabled: true,
  },
  {
    id: 'resolve-failure',
    description: 'Analyze a failed operation or check and decide how to fix, replan, ask, or stop.',
    prompt: jsonPrompt('Resolve a concrete failure.', [
      'Use the failure evidence from execution history.',
      'Decide whether to inspect more, implement a fix, ask the human, or fail clearly.',
      'Avoid repeating an unchanged failed action.',
    ]),
    model: { temperature: 0 },
    execution: execution('failure-analysis', ['code', 'testing', 'architecture'], {
      costWeight: 2,
      allowedTransitions: ['understand', 'implement', 'verify', 'finalize'],
      fallback: 'understand',
    }),
    enabled: true,
  },
  {
    id: 'extract-knowledge',
    description: 'Extract a reusable project understanding, pattern, decision candidate, or policy candidate.',
    prompt: jsonPrompt('Extract reusable project knowledge candidates.', [
      'Do not present assumptions about WHY as confirmed decisions.',
      'Prefer concrete patterns and understandings supported by project evidence.',
      'This operation does not automatically persist knowledge in the current runtime.',
    ]),
    model: { temperature: 0.1 },
    execution: execution('knowledge-extraction', ['project', 'architecture'], {
      costWeight: 2,
      allowedTransitions: ['finalize'],
    }),
    enabled: true,
  },
];

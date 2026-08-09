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
  "toolCalls": [{ "tool": "tool id", "input": {} }]
}
Use status=continue when requesting tools. Search only chooses retrieval tool calls; the runtime evidence evaluator decides satisfaction, missing items, and output facts.`;

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
      purpose: 'Choose retrieval tool calls for the active search action and subject.',
      rules: [
        'Treat activeStep.action + activeStep.subject as the complete search request.',
        'Allowed search actions are find-files, find-symbols, find-definitions, find-usages, find-references, and find-examples. Execute only the declared action.',
        'Use the supplied project index and existing evidence to choose concrete search/filesystem tool calls.',
        'On the first round, locate evidence for the declared subject. On later rounds, use stepContext.activeEvidence.missing to make the next retrieval narrower.',
        'Return tool calls only. The evidence evaluator is the only component that decides whether the step is satisfied, which facts were established, and what is still missing.',
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
    prompt: jsonPrompt('Build a focused understanding required by the current plan step.', [
      'Work only on the ACTIVE plan-step goal. First use stepContext.facts and activeEvidence; do not request a file merely to reconfirm a fact already supplied.',
      'Read only the most important files needed for the current question.',
      'Request at most 3 tool calls in one batch.',
      'Separate facts visible in code from inferred intent.',
      'Write concise factual observations after every evidence round so they can survive after raw file contents are dropped.',
      'Do not broaden the active goal merely to gather more files.',
      'After each evidence round, summarize what is known in stepResult and publish reusable results under the exact activeStep.outputs keys in stepResult.facts.',
      'Preserve concrete receiver chains and source scope from supplied evidence; do not replace configuration.project.id with state.task.projectId, nodus.projectSession with this.index, or otherwise substitute a different access path without direct evidence.',
      'If the supplied facts/evidence are sufficient for the active goal, derive the requested outputs and set stepResult.goalSatisfied=true instead of requesting more files.',
    ]),
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
      'Use completedStepEvidence to identify the minimum files and edits required.',
      'Do not emit file changes and do not search broadly in this operation.',
      'Return stepResult.goalSatisfied=true only when the target files and exact intended modifications are concrete. Put every exact relative target file path in stepResult.targets and publish the compact change plan under the exact activeStep.outputs key.',
      'Use exact access paths already established by facts/evidence. Do not upgrade a direct property access into a hypothetical getter/service or substitute a different receiver.',
      'If evidence is missing, return goalSatisfied=false and list the exact missing facts in stepResult.missing; let Recovery decide how to gather them.',
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
        'The runtime preloads activeStep.targetPath into toolContext before the edit call whenever possible. If that read is present, NEVER request the same file-system read again.',
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
      'This operation does not automatically persist knowledge in v0.1.',
    ]),
    model: { temperature: 0.1 },
    execution: execution('knowledge-extraction', ['project', 'architecture'], {
      costWeight: 2,
      allowedTransitions: ['finalize'],
    }),
    enabled: true,
  },
];

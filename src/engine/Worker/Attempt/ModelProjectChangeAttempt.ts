import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { Project } from '@engine/Project/Project.js';
import { PatchApplicator } from '@engine/Worker/Edit/PatchApplicator.js';
import type { WorkerAttempt, WorkerAttemptContext, WorkerAttemptResult } from '@engine/Worker/Attempt/WorkerAttempt.js';
import { callDiffFile, callModel } from '@model/Runner/ModelCaller.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';
import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';

interface ChangeDecision {
  outcome: 'ready' | 'missing-information' | 'already-completed' | 'failed';
  summary?: string;
  reason?: string;
  questions?: string[];
  edits?: Array<{ path: string; instruction: string }>;
}

export interface ProjectChangeAttemptProfile {
  purpose: string;
  guidance: string;
}

const decisionSchema: ModelResponseSchema = {
  description: 'One bounded attempt to perform the assigned project change.',
  fields: {
    outcome: {
      type: 'option',
      description: 'Whether the task can be executed now or needs more concrete project knowledge.',
      optionList: [
        { id: 'ready', description: 'Enough information is available; perform the listed edits.' },
        { id: 'missing-information', description: 'Specific project facts are required before editing safely.' },
        { id: 'already-completed', description: 'The requested outcome is already true; no edit is needed.' },
        { id: 'failed', description: 'The task cannot be performed under the supplied constraints.' },
      ],
    },
    summary: { type: 'string', optional: true },
    reason: { type: 'string', optional: true },
    questions: { type: 'array', items: { type: 'string' }, optional: true },
    edits: {
      type: 'array',
      optional: true,
      items: {
        type: 'object',
        fields: {
          path: { type: 'string' },
          instruction: { type: 'string' },
        },
      },
    },
  },
};

/**
 * Current concrete attempt implementation for project changes.
 * It first tries to execute the task; only an explicit lack of project facts
 * produces `missing-information` for the Worker loop to resolve via Research.
 */
export class ModelProjectChangeAttempt implements WorkerAttempt {
  public constructor(
    private readonly project: Project,
    private readonly model: ModelRunner,
    private readonly logger: EngineLogger,
    private readonly profile: ProjectChangeAttemptProfile,
    private readonly maxEditsPerAttempt = 6,
    private readonly applicator = new PatchApplicator(),
  ) {}

  public async execute(context: WorkerAttemptContext): Promise<WorkerAttemptResult> {
    const candidates = this.candidateFiles(context);
    const decision = await callModel<ChangeDecision>(this.model, this.logger, {
      request: {
        message: 'Attempt to complete the assigned PlanStep now.',
        data: {
          task: context.task.description,
          step: context.step,
          purpose: this.profile.purpose,
          candidateFiles: candidates,
          knowledge: context.knowledge.map((item) => ({
            question: item.question,
            answer: item.answer,
            sources: item.sources.map((source) => source.path),
          })),
        },
        format: ModelRequestFormat.Json,
        guidance: [
          this.profile.guidance,
          'Start from execution: if the supplied information is sufficient, return the concrete edits immediately.',
          'If safe execution requires project facts that are not supplied, do not guess. Return only specific bounded questions.',
          'Do not ask broad questions such as "understand the project". Ask only facts needed for this task.',
          'Keep edits minimal and preserve unrelated behavior.',
          'Do not perform validation; validation is a separate concern.',
        ].join('\n'),
      },
      response: { format: ModelResponseFormat.Json, schema: decisionSchema },
      settings: { maxTokens: 2048 },
    });

    if (decision.outcome === 'already-completed') {
      return { status: 'completed', summary: decision.summary ?? 'Requested outcome is already present.' };
    }

    if (decision.outcome === 'failed') {
      return { status: 'failed', reason: decision.reason ?? 'The task cannot be completed under the supplied constraints.' };
    }

    if (decision.outcome === 'missing-information') {
      const questions = (decision.questions ?? []).map((question) => question.trim()).filter(Boolean).slice(0, 4);
      if (questions.length === 0) throw new Error('Attempt reported missing information without concrete questions.');
      return { status: 'missing-information', questions, reason: decision.reason };
    }

    const edits = (decision.edits ?? []).slice(0, this.maxEditsPerAttempt);
    if (edits.length === 0) throw new Error('Attempt was ready but returned no edits.');

    const changed: string[] = [];
    for (const edit of edits) {
      try {
        const source = await this.project.read(edit.path);
        const response = await callDiffFile(this.model, this.logger, {
          path: edit.path,
          request: {
            message: 'Apply this concrete project edit.',
            data: {
              task: context.task.description,
              step: context.step,
              instruction: edit.instruction,
              knowledge: context.knowledge.map((item) => ({ question: item.question, answer: item.answer })),
              authoritativeSource: { path: edit.path, content: source },
            },
            format: ModelRequestFormat.Json,
            guidance: [
              this.profile.guidance,
              'Edit exactly the authoritative file supplied in DATA.',
              'Return the minimal unified diff for this file only.',
              'Do not change unrelated code or documentation.',
            ].join('\n'),
          },
        });

        const content = this.applicator.apply(source, response.hunks, edit.path);
        if (content !== source) {
          await this.project.write(edit.path, content);
          changed.push(edit.path);
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Edit attempt failed for ${edit.path}: ${reason}`);
      }
    }

    if (changed.length === 0) throw new Error('Attempt produced no project changes.');
    return {
      status: 'completed',
      summary: decision.summary ?? `Changed ${changed.join(', ')}`,
    };
  }

  private candidateFiles(context: WorkerAttemptContext): string[] {
    const paths = new Set<string>();
    for (const source of context.knowledge.flatMap((item) => item.sources)) paths.add(source.path);
    for (const file of this.project.candidateFiles(`${context.task.description}\n${context.step.goal}`, 16)) paths.add(file.path);
    return [...paths].slice(0, 24);
  }
}

// FinalResultCompiler.ts
import { parseWorkflowDataRef } from '@planner/WorkflowData';
import type { PlannerContext } from '@planner/PlannerContext';
import type { PlanStep } from '@planner/TaskPlan';
import type { Execution } from '@core/Execution/Execution';
import type { Task } from '@core/Task/Task';
import type { StepResult } from '@model/Result/OperationResult';

export interface CompiledFinalResult {
  answer: string;
  stepResult: StepResult;
}

export class FinalResultCompiler {
  public compile(step: PlanStep, task: Task, execution: Execution, context: PlannerContext): CompiledFinalResult | undefined {
    if (step.type !== 'finalize' || step.outputs.length !== 1) return undefined;
    if (step.inputs.length === 0 || step.inputs.some((key) => !context.has(key))) return undefined;

    const supported = step.inputs.some((key) => {
      try {
        return ['change-result', 'review-result', 'verification-result'].includes(parseWorkflowDataRef(key).kind);
      } catch {
        return false;
      }
    });
    if (!supported) return undefined;

    const changedFiles = Array.from(new Set(execution.history
      .filter((event) => event.type === 'change-applied')
      .map((event) => (event.data as { path?: string } | undefined)?.path)
      .filter((path): path is string => Boolean(path))));
    const russian = this.isRussian(task.description);
    const answer = changedFiles.length > 0
      ? russian
        ? `Задача выполнена.\nИзменено файлов: ${changedFiles.length}\n${changedFiles.map((path) => `- ${path}`).join('\n')}`
        : `Task completed.\nChanged files: ${changedFiles.length}\n${changedFiles.map((path) => `- ${path}`).join('\n')}`
      : russian
        ? 'Задача выполнена.'
        : 'Task completed.';

    const inputFacts = context.select(step.inputs);
    const evidence = inputFacts.flatMap((fact) => fact.evidence);
    return {
      answer,
      stepResult: {
        goalSatisfied: true,
        findings: [answer.split('\n')[0]],
        evidence,
        missing: [],
        facts: [{ key: step.outputs[0], value: answer, evidence }],
      },
    };
  }

  private isRussian(value: string): boolean {
    const cyrillic = (value.match(/[А-Яа-яЁё]/g) ?? []).length;
    const latin = (value.match(/[A-Za-z]/g) ?? []).length;
    return cyrillic > latin;
  }
}

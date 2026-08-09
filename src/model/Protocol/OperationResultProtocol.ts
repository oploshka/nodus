// OperationResultProtocol.ts
export const OPERATION_RESULT_RETURN_FORMAT = `Return ONLY valid JSON with this shape:
{
  "status": "continue | waiting | completed | failed",
  "message": "short execution note",
  "finalAnswer": "full user-facing answer; use only when status=completed",
  "nextOperation": "optional operation id",
  "intent": "read | write; set this in plan when task intent can be classified",
  "toolCalls": [{ "tool": "tool id", "input": {} }],
  "changes": [{ "type": "write", "path": "relative/path", "content": "..." }, { "type": "delete", "path": "relative/path" }],
  "question": "question for human when status=waiting",
  "observations": ["short factual observation"],
  "stepResult": {
    "goalSatisfied": true,
    "targets": ["exact/relative/file.ts; prepare-change only"],
    "findings": ["short result of the ACTIVE step only"],
    "evidence": [{ "path": "optional/file", "symbol": "optional symbol", "fact": "fact supported by evidence" }],
    "missing": ["specific evidence still missing"],
    "facts": [{ "key": "one of activeStep.outputs", "value": "compact reusable fact", "evidence": [{ "path": "optional/file", "symbol": "optional symbol", "fact": "supporting fact" }] }]
  },
  "data": {}
}
For search, understand, prepare-change, review, and verify, always return stepResult.
For prepare-change, put every exact relative file to be edited/deleted in stepResult.targets.
The activeStep declares inputs and outputs. Use stepContext.facts as reusable results from prior semantic steps.
stepContext.activeEvidence contains accumulated findings/evidence from earlier attempts of THIS step; use it instead of restarting from zero.
When you establish an activeStep output, return it in stepResult.facts using EXACTLY one of activeStep.outputs as key.
Set goalSatisfied=true when the ACTIVE step goal is satisfied or all declared outputs are established.
Put only concrete unresolved evidence in missing. Do not work on later plan steps.
When activeStep is supplied, leave nextOperation empty because PlanExecutor owns routing.
When toolCalls is non-empty, use status=continue and leave changes, question, finalAnswer, and nextOperation empty so Nodus can return tool results to you.
When asking a human question, use status=waiting and leave nextOperation empty so the answer can return to the same operation.
Use changes for project file edits. If another intellectual step is needed, set nextOperation.
If the whole Task is done, use status=completed without nextOperation and put the complete answer for the human in finalAnswer.
Keep message short.`;

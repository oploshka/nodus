export type AgentResult =
  | {
  status: 'completed';
  message: string;
}
  | {
  status: 'waiting';
  question: string;
}
  | {
  status: 'failed';
  error: string;
};
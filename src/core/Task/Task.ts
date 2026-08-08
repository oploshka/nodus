export type TaskStatus =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface Task {
  id: string;
  description: string;
  status: TaskStatus;
  // createdAt: Date;
  // updatedAt: Date;
}
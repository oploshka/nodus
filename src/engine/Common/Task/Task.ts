import { randomUUID } from 'node:crypto';

export class Task {
  public readonly id = randomUUID();
  public readonly createdAt = new Date().toISOString();

  public constructor(
    public readonly description: string,
    public readonly projectId: string,
  ) {}
}

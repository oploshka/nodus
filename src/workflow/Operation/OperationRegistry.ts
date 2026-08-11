import type { Operation } from './Operation';

export class OperationRegistry {
  private readonly operations = new Map<string, Operation>();

  public register(operation: Operation): void {
    this.operations.set(operation.definition.id, operation);
  }

  public get(id: string): Operation | undefined {
    return this.operations.get(id);
  }

  public require(id: string): Operation {
    const operation = this.get(id);
    if (!operation) throw new Error(`Operation is not registered: ${id}`);
    return operation;
  }
}

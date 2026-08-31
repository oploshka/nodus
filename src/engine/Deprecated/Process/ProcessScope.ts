export class ProcessScope {
  private readonly declared = new Set<string>();
  private readonly values = new Map<string, unknown>();

  public constructor(
    variableKeys: ReadonlyArray<string> = [],
    initial: Readonly<Record<string, unknown>> = {},
  ) {
    for (const key of variableKeys) this.declared.add(key);
    for (const [key, value] of Object.entries(initial)) {
      this.assertDeclared(key);
      this.values.set(key, value);
    }
  }

  public set(key: string, value: unknown): void {
    this.assertDeclared(key);
    this.values.set(key, value);
  }

  public get(key: string): unknown {
    this.assertDeclared(key);
    if (!this.values.has(key)) throw new Error(`Process variable is not assigned: ${key}`);
    return this.values.get(key);
  }

  /** Resolve a declared key with optional object-property path, e.g. validation.reason. */
  public resolve(reference: string): unknown {
    const [key, ...path] = reference.split('.');
    let value = this.get(key);

    for (const segment of path) {
      if (typeof value !== 'object' || value === null || !(segment in value)) {
        throw new Error(`Cannot resolve process variable reference: ${reference}`);
      }
      value = (value as Record<string, unknown>)[segment];
    }

    return value;
  }

  public bind(mapping: Readonly<Record<string, string>> = {}): Record<string, unknown> {
    return Object.fromEntries(Object.entries(mapping).map(([name, reference]) => [name, this.resolve(reference)]));
  }

  public snapshot(): Readonly<Record<string, unknown>> {
    return Object.fromEntries(this.values.entries());
  }

  private assertDeclared(key: string): void {
    if (!this.declared.has(key)) throw new Error(`Process variable is not declared: ${key}`);
  }
}

// DependencyGraph.ts

export interface Dependency {
  from: string;
  to: string;
}

export class DependencyGraph {
  private readonly dependencies: Dependency[] = [];

  add(from: string, to: string): void {
    this.dependencies.push({
      from,
      to,
    });
  }

  getDependencies(path: string): string[] {
    return this.dependencies
      .filter((dependency) => dependency.from === path)
      .map((dependency) => dependency.to);
  }

  getDependents(path: string): string[] {
    return this.dependencies
      .filter((dependency) => dependency.to === path)
      .map((dependency) => dependency.from);
  }
}
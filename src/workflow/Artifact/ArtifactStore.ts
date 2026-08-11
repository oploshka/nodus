import type { Artifact } from './Artifact';

export class ArtifactStore {
  private readonly artifacts = new Map<string, Artifact>();

  public has(key: string): boolean {
    return this.artifacts.has(key);
  }

  public get<T = unknown>(key: string): Artifact<T> | undefined {
    return this.artifacts.get(key) as Artifact<T> | undefined;
  }

  public set<T>(artifact: Artifact<T>): void {
    this.artifacts.set(artifact.key, artifact);
  }

  public values(): Artifact[] {
    return [...this.artifacts.values()];
  }
}

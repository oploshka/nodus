// OperationRegistry.ts
import type { OperationProfile } from '@operation/Profile/OperationProfile';

export class OperationRegistry {
  private readonly profiles = new Map<string, OperationProfile>();

  public register(profile: OperationProfile): void {
    this.profiles.set(profile.id, profile);
  }

  public get(id: string): OperationProfile | undefined {
    const profile = this.profiles.get(id);
    return profile?.enabled ? profile : undefined;
  }

  public has(id: string): boolean {
    return Boolean(this.get(id));
  }

  public list(): OperationProfile[] {
    return [...this.profiles.values()].filter((profile) => profile.enabled);
  }
}

export interface BuildInfo {
  version: string;
  commits: number | null;
  sha: string;
  short: string;
  subject: string;
  builtAt: string;
}
export function versionFromCount(count: number): string;
export function buildInfo(env?: Record<string, string | undefined>): Promise<BuildInfo>;

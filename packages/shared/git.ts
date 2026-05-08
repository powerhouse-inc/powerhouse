export const GITHUB_REPO_URL = "https://github.com/powerhouse-inc/powerhouse";

export function buildTreeUrl(sha: string): string | null {
  if (!sha || sha === "unknown") return null;
  return `${GITHUB_REPO_URL}/tree/${sha}`;
}

export function shortGitSha(sha: string): string {
  return sha === "unknown" ? sha : sha.slice(0, 7);
}

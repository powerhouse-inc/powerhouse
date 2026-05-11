import { buildTreeUrl } from "@powerhousedao/shared";

declare const REACTOR_API_VERSION: string | undefined;
declare const REACTOR_API_GIT_SHA: string | undefined;

export function getVersion(): string {
  if (typeof REACTOR_API_VERSION !== "undefined") return REACTOR_API_VERSION;
  return (
    process.env.WORKSPACE_VERSION ??
    process.env.npm_package_version ??
    "unknown"
  );
}

export function getGitHash(): string {
  if (typeof REACTOR_API_GIT_SHA !== "undefined") return REACTOR_API_GIT_SHA;
  return process.env.WORKSPACE_GIT_SHA ?? "unknown";
}

export function getGitUrl(): string | null {
  return buildTreeUrl(getGitHash());
}

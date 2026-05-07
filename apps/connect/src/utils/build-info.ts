import { buildTreeUrl, shortGitSha } from "@powerhousedao/shared";
import { packageJson } from "./package-json.js";

export { shortGitSha };

declare const CONNECT_VERSION: string | undefined;
declare const CONNECT_GIT_SHA: string | undefined;

export function getVersion(): string {
  if (typeof CONNECT_VERSION !== "undefined") return CONNECT_VERSION;
  return (
    process.env.WORKSPACE_VERSION ??
    process.env.npm_package_version ??
    packageJson.version
  );
}

export function getGitSha(): string {
  if (typeof CONNECT_GIT_SHA !== "undefined") return CONNECT_GIT_SHA;
  return process.env.WORKSPACE_GIT_SHA ?? "unknown";
}

export function getGitUrl(): string | null {
  return buildTreeUrl(getGitSha());
}

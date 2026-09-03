import { buildTreeUrl, shortGitSha } from "@powerhousedao/shared";
import { packageJson } from "./package-json.js";

export { shortGitSha };

declare const CONNECT_VERSION: string | undefined;
declare const CONNECT_GIT_SHA: string | undefined;
declare const PH_CONNECT_BUILD_HASH: string | undefined;

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

/**
 * Build identity baked in at build time (define PH_CONNECT_BUILD_HASH —
 * see builder-tools' connectBuildHashPlugin). Identical builds of the same
 * inputs produce the same hash; any change to the deployed content (Connect
 * version, project config, package list, build options) changes it.
 */
export function getBuildHash(): string {
  if (typeof PH_CONNECT_BUILD_HASH !== "undefined")
    return PH_CONNECT_BUILD_HASH;
  return "unknown";
}

export function getGitUrl(): string | null {
  return buildTreeUrl(getGitSha());
}

import { buildTreeUrl, shortGitSha } from "@powerhousedao/shared";
import { packageJson } from "./package-json.js";

export { shortGitSha };

declare const CONNECT_VERSION: string | undefined;
declare const CONNECT_GIT_SHA: string | undefined;
declare const PH_CONNECT_BUILD_HASH: string | undefined;
declare const CONNECT_PACKAGED_DIST: boolean | undefined;

export function getVersion(): string {
  if (typeof CONNECT_VERSION !== "undefined") return CONNECT_VERSION;
  return (
    process.env.WORKSPACE_VERSION ??
    process.env.npm_package_version ??
    packageJson.version
  );
}

/** True in the tsdown dist projects install; false in the monorepo app, where Vite bundles the worker. */
export function isPackagedConnectDist(): boolean {
  return typeof CONNECT_PACKAGED_DIST !== "undefined" && CONNECT_PACKAGED_DIST;
}

export function getGitSha(): string {
  if (typeof CONNECT_GIT_SHA !== "undefined") return CONNECT_GIT_SHA;
  return process.env.WORKSPACE_GIT_SHA ?? "unknown";
}

/**
 * The build identity sent as `appBuildId` in the worker hello handshake (see
 * `reactor-worker-client.ts`): the baked-in git sha in production, the static
 * package version otherwise.
 *
 * Deliberately NOT a function of the worker bundle's content token. The token
 * travels as its own `buildDigest` field on the fingerprint, because it is
 * fetched per tab and can be absent for a tab of the identical build; folding
 * it in here made "token unavailable" indistinguishable from "different
 * build", and two tabs of one build then bumped the worker generation against
 * each other. `ReactorHost.versionsCompatible` compares the token only when
 * both tabs have one, and `workerGenForVersion` still folds it into the worker
 * name, so the W0.6 behaviour is intact: a dev rebuild changes the token and
 * lands every tab on a fresh worker (see
 * docs/bugs/2026-10-03-pglite-aborted-transaction-bricks-worker-reactor.md).
 */
export function getAppBuildId(): string {
  const gitSha = getGitSha();
  if (gitSha !== "unknown") return gitSha;
  return getVersion();
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

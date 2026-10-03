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
 * The reactor worker's version fingerprint, sent as `appBuildId` in the
 * worker hello handshake (see `reactor-worker-client.ts`). `ReactorHost`
 * broadcasts a reload whenever a tab's fingerprint differs from the worker's,
 * so this must change whenever the worker's actual code changes.
 *
 * Production (a real git sha baked in via `CONNECT_GIT_SHA`/
 * `WORKSPACE_GIT_SHA`) returns that sha unchanged — `workerBuildDigest` is
 * ignored, so this is a strict no-op there.
 *
 * Dev has no git sha, and the static package version alone does not move
 * between rebuilds. `workerBuildDigest` — the dev-served worker bundle's
 * content token, see `fetchReactorWorkerBuildDigest` in
 * `./reactor-worker-url.js` — is folded in so a rebuilt worker bundle
 * produces a different fingerprint even though the version string didn't.
 * This is the W0.6 fix for the stale-SharedWorker bug (see
 * docs/bugs/2026-10-03-pglite-aborted-transaction-bricks-worker-reactor.md):
 * without it, a dev tab's fingerprint never changes across rebuilds, so the
 * worker never reloads and a stale worker can survive indefinitely.
 */
export function getAppBuildId(workerBuildDigest?: string | null): string {
  const gitSha = getGitSha();
  if (gitSha !== "unknown") return gitSha;
  const version = getVersion();
  return workerBuildDigest ? `${version}+${workerBuildDigest}` : version;
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

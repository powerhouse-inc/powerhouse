import { getBuildHash } from "../utils/build-info.js";

export const isMac = window.navigator.appVersion.includes("Mac");

export interface BuildHashStatus {
  /** Hash baked into the running build. */
  currentHash: string;
  /** Hash the server is currently serving. */
  deployedHash: string;
  /** true when the running build matches what the server serves. */
  isCurrent: boolean;
}

/**
 * Same-origin build-identity probe. The build bakes a hash of the inputs that
 * determine the deployed content into the bundle (define
 * `PH_CONNECT_BUILD_HASH`, see builder-tools' connectBuildHashPlugin) and
 * emits `build-hash.json` next to the app (served no-cache). Comparing the
 * two tells us whether the server is serving a different build than the one
 * this page was loaded from — the reliable "a new deploy went out" signal.
 * Unlike the old GitHub-raw version check it works on localhost (it compares
 * against what the origin actually serves, not a remote branch head) and
 * needs no network beyond the app's own origin.
 *
 * Returns null when there is nothing to compare: dev/studio builds (no hash
 * baked), a server predating `build-hash.json`, an offline fetch, or a
 * malformed body.
 */
export const getBuildHashStatus = async (): Promise<BuildHashStatus | null> => {
  const currentHash = getBuildHash();
  if (!currentHash || currentHash === "unknown") return null;
  try {
    const result = await fetch(`${import.meta.env.BASE_URL}build-hash.json`, {
      cache: "no-cache",
    });
    if (!result.ok) return null;
    const data = (await result.json()) as { hash?: unknown };
    if (typeof data.hash !== "string" || !data.hash) return null;
    return {
      currentHash,
      deployedHash: data.hash,
      isCurrent: data.hash === currentHash,
    };
  } catch {
    return null;
  }
};

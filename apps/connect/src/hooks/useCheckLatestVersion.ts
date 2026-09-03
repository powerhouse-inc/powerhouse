import { connectConfig } from "@powerhousedao/connect/config";
import { getBuildHashStatus } from "@powerhousedao/connect/hooks";
import { logger } from "document-model";
import { useEffect } from "react";

// Session-scoped guard: records the deployed hash this tab already reloaded
// for, so a broken or rolling deploy (server hash keeps changing under us)
// cannot turn the tab into a reload loop. Cleared implicitly with the tab.
const RELOADED_FOR_KEY = "ph-reloaded-for-build-hash";

/**
 * Drop the service worker's stale caches (precache + the NetworkFirst shell
 * cache) before reloading onto a new deploy, so the post-reload navigation
 * is answered from the network / fresh build instead of leftovers of the
 * build we are leaving. Best-effort: if the Caches API is unavailable or a
 * delete fails, the reload still picks up the new shell (the navigation
 * route is NetworkFirst).
 */
async function clearStaleCaches(): Promise<void> {
  try {
    if (!("caches" in window)) return;
    const keys = await window.caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.includes("precache") || key.includes("ph-shell"))
        .map((key) => window.caches.delete(key)),
    );
  } catch (error) {
    logger.warn(
      "Failed to clear stale caches before update reload @error",
      error,
    );
  }
}

/**
 * Detects that the server is serving a different build than the one this
 * page was loaded from (a new deploy) and reloads onto it — once per session
 * per deployed hash. Checked on mount and whenever the tab returns to the
 * foreground, so a deploy that lands while the tab sits open is picked up on
 * the next focus without a manual reload. The in-tab "new version available"
 * service-worker prompt (ServiceWorkerUpdatePrompt) remains the opt-in path
 * for workers that are waiting but not yet controlling.
 */
export const useCheckLatestVersion = () => {
  useEffect(() => {
    if (
      import.meta.env.MODE === "development" ||
      connectConfig.studioMode ||
      !connectConfig.warnOutdatedApp
    ) {
      return;
    }

    const checkBuildHash = async () => {
      const status = await getBuildHashStatus();
      if (!status || status.isCurrent) return;

      const reloadedFor = window.sessionStorage.getItem(RELOADED_FOR_KEY);
      if (reloadedFor === status.deployedHash) return;
      window.sessionStorage.setItem(RELOADED_FOR_KEY, status.deployedHash);

      logger.info(
        "New deploy detected — reloading from build @currentHash to @deployedHash",
        status.currentHash,
        status.deployedHash,
      );
      await clearStaleCaches();
      window.location.reload();
    };

    void checkBuildHash();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkBuildHash();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
};

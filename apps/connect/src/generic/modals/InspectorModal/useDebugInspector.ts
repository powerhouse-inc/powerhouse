import { clearReactorStorage } from "@powerhousedao/connect/store";
import {
  getCachedReactorPgMajor,
  PENDING_PG_SEED_KEY,
  subscribeReactorPgMajor,
} from "@powerhousedao/connect/utils";
import { useCallback, useSyncExternalStore } from "react";

const SUPPORTED_PG_VERSIONS = [16, 17] as const;

export function useDebugInspector() {
  const currentPgVersion = useSyncExternalStore(
    subscribeReactorPgMajor,
    getCachedReactorPgMajor,
    () => undefined,
  );

  const onResetToPgVersion = useCallback(async (major: number) => {
    console.info(`[debug-inspector] Reset requested: PG${major}`);
    try {
      localStorage.setItem(PENDING_PG_SEED_KEY, String(major));
      console.info(`[debug-inspector] Clearing reactor storage...`);
      await clearReactorStorage();
      console.info(`[debug-inspector] Storage cleared. Reloading...`);
      window.location.reload();
    } catch (err) {
      console.error("[debug-inspector] Reset failed:", err);
      localStorage.removeItem(PENDING_PG_SEED_KEY);
      throw err;
    }
  }, []);

  return {
    supportedPgVersions: SUPPORTED_PG_VERSIONS,
    currentPgVersion: currentPgVersion ?? null,
    onResetToPgVersion,
  };
}

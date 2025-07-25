import { logger } from "document-drive";
import { useSetAtom } from "jotai";
import { useCallback } from "react";
import { drivesAtom } from "./atoms.js";

/** Sets the drives for a reactor. */
export function useSetDrives() {
  return useSetAtom(drivesAtom);
}

/** Refreshes the drives for a reactor. */
export function useRefreshDrives() {
  const setDrives = useSetDrives();

  return useCallback(() => {
    setDrives().catch((error: unknown) => logger.error(error));
  }, [setDrives]);
}

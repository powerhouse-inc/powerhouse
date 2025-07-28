import { logger } from "document-drive";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { pHPackagesAtom, pHPackagesInitializedAtom } from "./atoms.js";
import { type PHPackage } from "./types.js";

export function useSetPHPackages() {
  return useSetAtom(pHPackagesAtom);
}

export function useInitializePHPackages(
  phPackages: Promise<PHPackage[] | undefined> | PHPackage[] | undefined,
) {
  const phPackagesInitialized = useAtomValue(pHPackagesInitializedAtom);
  const setPHPackages = useSetPHPackages();

  useEffect(() => {
    if (phPackagesInitialized) return;

    async function initializePHPackages() {
      const initializedPhPackages = await phPackages;
      window.phPackages = initializedPhPackages;
      setPHPackages(initializedPhPackages ?? window.phPackages).catch(
        logger.error,
      );
    }
    initializePHPackages().catch(logger.error);
  }, [phPackagesInitialized, setPHPackages]);
}

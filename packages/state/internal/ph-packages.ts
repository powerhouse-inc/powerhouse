import { logger } from "document-drive";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { type PHPackage } from "../types.js";
import { pHPackagesAtom, pHPackagesInitializedAtom } from "./atoms.js";

export function useSetPHPackages() {
  return useSetAtom(pHPackagesAtom);
}

export function useInitializePHPackages(
  phPackages: Promise<PHPackage[] | undefined> | PHPackage[] | undefined,
) {
  const phPackagesInitialized = useAtomValue(pHPackagesInitializedAtom);
  const setPHPackages = useSetPHPackages();

  useEffect(() => {
    async function initializePHPackages() {
      if (phPackagesInitialized) return;

      const initializedPhPackages = await phPackages;
      console.log("initializedPhPackages", initializedPhPackages);
      console.log("window.phPackages", window.phPackages);
      if (initializedPhPackages) {
        window.phPackages = initializedPhPackages;
      }
      setPHPackages(window.phPackages).catch(logger.error);
    }
    initializePHPackages().catch(logger.error);
  }, [phPackagesInitialized, setPHPackages, phPackages]);
}

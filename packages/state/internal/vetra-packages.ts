import { logger } from "document-drive";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { type VetraPackage } from "../types.js";
import { vetraPackagesAtom, vetraPackagesInitializedAtom } from "./atoms.js";

export function useSetVetraPackages() {
  return useSetAtom(vetraPackagesAtom);
}

export function useInitializeVetraPackages(
  vetraPackages:
    | Promise<VetraPackage[] | undefined>
    | VetraPackage[]
    | undefined,
) {
  const vetraPackagesInitialized = useAtomValue(vetraPackagesInitializedAtom);
  const setVetraPackages = useSetVetraPackages();

  useEffect(() => {
    async function initializeVetraPackages() {
      if (vetraPackagesInitialized) return;

      const initializedVetraPackages = await vetraPackages;
      console.log("initializedVetraPackages", initializedVetraPackages);
      console.log("window.vetraPackages", window.vetraPackages);
      if (initializedVetraPackages) {
        window.vetraPackages = initializedVetraPackages;
      }
      setVetraPackages(window.vetraPackages).catch(logger.error);
    }
    initializeVetraPackages().catch(logger.error);
  }, [vetraPackagesInitialized, setVetraPackages, vetraPackages]);
}

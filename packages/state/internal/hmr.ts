import { logger } from "document-drive";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import type { ViteHotContext } from "vite/types/hot.js";
import { hmrAtom, hmrInitializedAtom } from "./atoms.js";

export function useInitializeHmr(
  hmr: Promise<ViteHotContext | undefined> | undefined,
) {
  const initialized = useAtomValue(hmrInitializedAtom);
  const setHmr = useSetAtom(hmrAtom);
  useEffect(() => {
    async function initializeHmr() {
      const hmrValue = await hmr;
      setHmr(hmrValue);
    }
    initializeHmr().catch(logger.error);
  }, [hmr, setHmr, initialized]);
}

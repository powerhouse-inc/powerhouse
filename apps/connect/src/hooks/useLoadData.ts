import { useSubscribeToVetraPackages } from "#services";
import { createReactor, useSetSentryUser } from "#store";
import { logger } from "document-drive";
import { useEffect } from "react";

export function useLoadData() {
  useEffect(() => {
    createReactor().catch(logger.error);
  }, []);
  useSubscribeToVetraPackages();
  useSetSentryUser();
}

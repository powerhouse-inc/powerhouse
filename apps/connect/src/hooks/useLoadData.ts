import {
  createReactor,
  useSetSentryUser,
  useSubscribeToVetraPackages,
} from "@powerhousedao/connect";
import { logger } from "document-drive";
import { useEffect } from "react";

export function useLoadData() {
  useEffect(() => {
    createReactor().catch(logger.error);
  }, []);
  useSubscribeToVetraPackages();
  useSetSentryUser();
}

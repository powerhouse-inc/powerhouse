import type { Trigger } from "@powerhousedao/shared/document-drive";
import { useCallback, useMemo } from "react";

export type ClientErrorHandler = {
  strandsErrorHandler: (
    driveId: string,
    trigger: Trigger,
    status: number,
    errorMessage: string,
  ) => Promise<void>;
};

// Legacy -- to be removed.
export const useClientErrorHandler = (): ClientErrorHandler => {
  const strandsErrorHandler: ClientErrorHandler["strandsErrorHandler"] =
    useCallback(async () => {
      //
    }, []);

  return useMemo(() => ({ strandsErrorHandler }), [strandsErrorHandler]);
};

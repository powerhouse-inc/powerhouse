import { ERROR, LOCAL, type SharingType } from "@powerhousedao/design-system";
import {
  SynchronizationUnitNotFoundError,
  type IDocumentDriveServer,
  type SyncStatus,
} from "document-drive";
import { atom, useAtomValue } from "jotai";
import { useCallback } from "react";

type Reactor = IDocumentDriveServer;

const reactorAtom = atom<Reactor | undefined>(undefined);

export function useReactor() {
  return useAtomValue(reactorAtom);
}

export function useGetSyncStatusSync() {
  const reactor = useReactor();
  const getSyncStatusSync = useCallback(
    (syncId: string, sharingType: SharingType): SyncStatus | undefined => {
      if (sharingType === LOCAL) return;
      if (!reactor) {
        return "INITIAL_SYNC";
      }
      try {
        const syncStatus = reactor.getSyncStatus(syncId);
        if (syncStatus instanceof SynchronizationUnitNotFoundError)
          return "INITIAL_SYNC";
        return syncStatus;
      } catch (error) {
        console.error(error);
        return ERROR;
      }
    },
    [reactor],
  );

  return getSyncStatusSync;
}

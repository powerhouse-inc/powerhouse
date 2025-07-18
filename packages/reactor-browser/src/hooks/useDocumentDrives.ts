import type { IDocumentDriveServer } from "document-drive";
import { type DocumentDriveDocument, type Trigger } from "document-drive";
import { atom, useAtom } from "jotai";
import { useCallback, useMemo } from "react";

import { documentToHash } from "../utils/index.js";

const documentDrivesAtom = atom(
  new Map<IDocumentDriveServer, DocumentDriveDocument[]>(),
);
documentDrivesAtom.debugLabel = "documentDrivesAtomInReactorBrowser";

export function drivesToHash(drives: DocumentDriveDocument[]): string {
  return drives.map(documentToHash).join("&");
}

const readWriteDocumentDrivesAtom = (server?: IDocumentDriveServer) => () =>
  atom(
    (get) => (server ? (get(documentDrivesAtom).get(server) ?? []) : []),
    (_get, set, newDrives: DocumentDriveDocument[]) => {
      set(documentDrivesAtom, (map) => {
        if (!server) {
          return new Map();
        }
        const currentDrives = map.get(server) ?? [];
        if (
          currentDrives.length !== newDrives.length ||
          drivesToHash(currentDrives) !== drivesToHash(newDrives)
        ) {
          return new Map(map).set(server, newDrives);
        } else {
          return map;
        }
      });
    },
  );

export type IDrivesState = "INITIAL" | "LOADING" | "LOADED" | "ERROR";
export const documentDrivesInitialized = atom<IDrivesState>("INITIAL");
documentDrivesInitialized.debugLabel =
  "documentDrivesInitializedInReactorBrowser";

export type ClientErrorHandler = {
  strandsErrorHandler: (
    driveId: string,
    trigger: Trigger,
    status: number,
    errorMessage: string,
  ) => Promise<void>;
};

export function useDocumentDrives(reactor?: IDocumentDriveServer) {
  const [documentDrives, setDocumentDrives] = useAtom(
    useMemo(readWriteDocumentDrivesAtom(reactor), [reactor]),
  );

  const refreshDocumentDrives = useCallback(async () => {
    if (!reactor) {
      return;
    }

    const documentDrives: DocumentDriveDocument[] = [];
    try {
      const driveIds = await reactor.getDrives();
      if (!driveIds) return;
      for (const id of driveIds) {
        try {
          const drive = await reactor.getDrive(id);
          if (!drive) continue;
          documentDrives.push(drive);
        } catch (error) {
          console.error(error);
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setDocumentDrives(documentDrives);
    }
  }, [reactor]);

  const [status, setStatus] = useAtom(documentDrivesInitialized);

  if (status === "INITIAL") {
    setStatus("LOADING");
    refreshDocumentDrives()
      .then(() => setStatus("LOADED"))
      .catch(() => setStatus("ERROR"));
  }

  const serverSubscribeUpdates = useCallback(
    (clientErrorhandler: ClientErrorHandler) => {
      if (!reactor) {
        return;
      }
      const unsub1 = reactor.on(
        "syncStatus",
        async (_event, _status, error) => {
          if (error) {
            console.error(error);
          }
          await refreshDocumentDrives();
        },
      );
      const unsub2 = reactor.on("strandUpdate", () => refreshDocumentDrives());
      const unsubOnSyncError = reactor.on(
        "clientStrandsError",
        clientErrorhandler.strandsErrorHandler,
      );

      const unsub3 = reactor.on("defaultRemoteDrive", () =>
        refreshDocumentDrives(),
      );

      return () => {
        unsub1();
        unsub2();
        unsubOnSyncError();
        unsub3();
      };
    },
    [reactor, refreshDocumentDrives],
  );

  return useMemo(
    () =>
      [
        documentDrives,
        refreshDocumentDrives,
        serverSubscribeUpdates,
        status,
      ] as const,
    [documentDrives, status],
  );
}

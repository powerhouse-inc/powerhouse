import { useMemo, useCallback } from "react";
import type { IDocumentDriveServer } from "document-drive/server";
import { DocumentDriveDocument } from "document-model-libs/document-drive";
import { atom, useAtom } from "jotai";
import { atomFamily } from "jotai/utils";
import { Trigger } from "document-model-libs/document-drive";

import { useUnwrappedReactor } from "../useUnwrappedReactor";
import { documentToHash } from "../utils";

const documentDrivesAtom = atom(
  new Map<IDocumentDriveServer, DocumentDriveDocument[]>(),
);

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
export const documentDrivesInitializedMapAtomFamily = atomFamily(() =>
  atom<IDrivesState>("INITIAL"),
);

export type ClientErrorHandler = {
  strandsErrorHandler: (
    driveId: string,
    trigger: Trigger,
    status: number,
    errorMessage: string,
  ) => Promise<void>;
};

export function useDocumentDrives() {
  const reactor = useUnwrappedReactor();

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
      for (const id of driveIds) {
        try {
          const drive = await reactor.getDrive(id);
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

  const [status, setStatus] = useAtom(
    documentDrivesInitializedMapAtomFamily(reactor),
  );

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

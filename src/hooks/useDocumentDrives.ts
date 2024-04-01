import type { IDocumentDriveServer } from 'document-drive/server';
import { DocumentDriveDocument } from 'document-model-libs/document-drive';
import { atom, useAtom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { useCallback, useMemo } from 'react';

// map of DocumentDriveServer objects and their Document Drives
const documentDrivesAtom = atom(
    new Map<IDocumentDriveServer, DocumentDriveDocument[]>(),
);

// creates a derived atom that encapsulates the Map of Document Drives
const readWriteDocumentDrivesAtom = (server: IDocumentDriveServer) => () =>
    atom(
        get => get(documentDrivesAtom).get(server) ?? [],
        (_get, set, newDrives: DocumentDriveDocument[]) => {
            set(documentDrivesAtom, map => new Map(map).set(server, newDrives));
        },
    );

// keeps track of document drives that have been initialized
export const documentDrivesInitializedMapAtomFamily = atomFamily(() =>
    atom(false),
);

// returns an array with the document drives of a
// server and a method to fetch the document drives
export function useDocumentDrives(server: IDocumentDriveServer) {
    const [documentDrives, setDocumentDrives] = useAtom(
        // eslint-disable-next-line react-hooks/exhaustive-deps
        useMemo(readWriteDocumentDrivesAtom(server), [server]),
    );

    const refreshDocumentDrives = useCallback(async () => {
        try {
            const driveIds = await server.getDrives();
            const drives = await Promise.all(
                driveIds.map(id => server.getDrive(id)),
            );
            if (JSON.stringify(documentDrives) !== JSON.stringify(drives)) {
                setDocumentDrives(drives);
            }
            return drives;
        } catch (error) {
            console.error(error);
            setDocumentDrives([]);
        }
    }, [server, documentDrives]);

    // if the server has not been initialized then
    // fetches the drives for the first time
    const [isInitialized, setIsInitialized] = useAtom(
        documentDrivesInitializedMapAtomFamily(server),
    );

    if (!isInitialized) {
        setIsInitialized(true);
        refreshDocumentDrives();
    }

    const serverSubscribeUpdates = useCallback(() => {
        const unsub1 = server.on(
            'syncStatus',
            async (_event, _status, error) => {
                if (error) {
                    console.error(error);
                }

                await refreshDocumentDrives();
            },
        );
        const unsub2 = server.on('strandUpdate', () => refreshDocumentDrives());
        return () => {
            unsub1();
            unsub2();
        };
    }, [server, refreshDocumentDrives]);

    return useMemo(
        () =>
            [
                documentDrives,
                refreshDocumentDrives,
                serverSubscribeUpdates,
            ] as const,
        [documentDrives],
    );
}

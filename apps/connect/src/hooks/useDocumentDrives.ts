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
            set(documentDrivesAtom, map => {
                const currentDrives = map.get(server) ?? [];
                if (
                    JSON.stringify(currentDrives) !== JSON.stringify(newDrives)
                ) {
                    return new Map(map).set(server, newDrives);
                } else {
                    return map;
                }
            });
        },
    );
// keeps track of document drives that have been initialized
export type IDrivesState = 'INITIAL' | 'LOADING' | 'LOADED' | 'ERROR';
export const documentDrivesInitializedMapAtomFamily = atomFamily(() =>
    atom<IDrivesState>('INITIAL'),
);

// returns an array with the document drives of a
// server and a method to fetch the document drives
export function useDocumentDrives(server: IDocumentDriveServer) {
    const [documentDrives, setDocumentDrives] = useAtom(
        // eslint-disable-next-line react-hooks/exhaustive-deps
        useMemo(readWriteDocumentDrivesAtom(server), [server]),
    );

    const refreshDocumentDrives = useCallback(async () => {
        const documentDrives: DocumentDriveDocument[] = [];
        try {
            const driveIds = await server.getDrives();
            for (const id of driveIds) {
                try {
                    const drive = await server.getDrive(id);
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
    }, [server]);

    // if the server has not been initialized then
    // fetches the drives for the first time
    const [status, setStatus] = useAtom(
        documentDrivesInitializedMapAtomFamily(server),
    );

    if (status === 'INITIAL') {
        setStatus('LOADING');
        refreshDocumentDrives()
            .then(() => setStatus('LOADED'))
            .catch(() => setStatus('ERROR'));
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
                status,
            ] as const,
        [documentDrives, status],
    );
}

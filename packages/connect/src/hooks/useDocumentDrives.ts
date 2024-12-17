import type { IDocumentDriveServer } from 'document-drive/server';
import { DocumentDriveDocument } from 'document-model-libs/document-drive';
import { Document, OperationScope } from 'document-model/document';
import { atom, useAtom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { useCallback, useMemo } from 'react';
import { logger } from 'src/services/logger';
import { useUnwrappedReactor } from 'src/store/reactor';
import { ClientErrorHandler } from './useClientErrorHandler';

// map of DocumentDriveServer objects and their Document Drives
const documentDrivesAtom = atom(
    new Map<IDocumentDriveServer, DocumentDriveDocument[]>(),
);

export function documentToHash(drive: Document): string {
    return Object.keys(drive.operations)
        .map(
            key =>
                `${key}:${drive.operations[key as OperationScope].length}:${drive.operations[key as OperationScope].at(-1)?.hash}`,
        )
        .join(':');
}

export function drivesToHash(drives: DocumentDriveDocument[]): string {
    return drives.map(documentToHash).join('&');
}

// creates a derived atom that encapsulates the Map of Document Drives
const readWriteDocumentDrivesAtom = (server?: IDocumentDriveServer) => () =>
    atom(
        get => (server ? (get(documentDrivesAtom).get(server) ?? []) : []),
        (_get, set, newDrives: DocumentDriveDocument[]) => {
            set(documentDrivesAtom, map => {
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
// keeps track of document drives that have been initialized
export type IDrivesState = 'INITIAL' | 'LOADING' | 'LOADED' | 'ERROR';
export const documentDrivesInitializedMapAtomFamily = atomFamily(() =>
    atom<IDrivesState>('INITIAL'),
);

// returns an array with the document drives of a
// server and a method to fetch the document drives
export function useDocumentDrives() {
    const reactor = useUnwrappedReactor();
    const [documentDrives, setDocumentDrives] = useAtom(
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
                    logger.error(error);
                }
            }
        } catch (error) {
            logger.error(error);
        } finally {
            setDocumentDrives(documentDrives);
        }
    }, [reactor]);

    // if the server has not been initialized then
    // fetches the drives for the first time
    const [status, setStatus] = useAtom(
        documentDrivesInitializedMapAtomFamily(reactor),
    );

    if (status === 'INITIAL') {
        setStatus('LOADING');
        refreshDocumentDrives()
            .then(() => setStatus('LOADED'))
            .catch(() => setStatus('ERROR'));
    }

    const serverSubscribeUpdates = useCallback(
        (clientErrorhandler: ClientErrorHandler) => {
            if (!reactor) {
                return;
            }
            const unsub1 = reactor.on(
                'syncStatus',
                async (_event, _status, error) => {
                    if (error) {
                        logger.error(error);
                    }
                    await refreshDocumentDrives();
                },
            );
            const unsub2 = reactor.on('strandUpdate', () =>
                refreshDocumentDrives(),
            );
            const unsubOnSyncError = reactor.on(
                'clientStrandsError',
                clientErrorhandler.strandsErrorHandler,
            );

            const unsub3 = reactor.on('defaultRemoteDrive', () =>
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

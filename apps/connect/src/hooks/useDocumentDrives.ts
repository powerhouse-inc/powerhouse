import { useUnwrappedReactor } from '#store';
import type { IDocumentDriveServer } from 'document-drive';
import { type DocumentDriveDocument, logger } from 'document-drive';
import { type OperationScope, type PHDocument } from 'document-model';
import { atom, useAtom } from 'jotai';
import { useCallback, useMemo } from 'react';
import { type ClientErrorHandler } from './useClientErrorHandler.js';

// map of DocumentDriveServer objects and their Document Drives
const documentDrivesAtom = atom(
    new Map<IDocumentDriveServer, DocumentDriveDocument[]>(),
);
documentDrivesAtom.debugLabel = 'documentDrivesAtomInConnect';

export function documentToHash(drive: PHDocument): string {
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
readWriteDocumentDrivesAtom.debugLabel = 'readWriteDocumentDrivesAtomInConnect';
// keeps track of document drives that have been initialized
export type IDrivesState = 'INITIAL' | 'LOADING' | 'LOADED' | 'ERROR';
export const documentDrivesInitialized = atom<IDrivesState>('INITIAL');
documentDrivesInitialized.debugLabel = 'documentDrivesInitializedInConnect';

// returns an array with the document drives of a
// server and a method to fetch the document drives
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
            if (driveIds) {
                for (const id of driveIds) {
                    try {
                        const drive = await reactor.getDrive(id);
                        if (drive) {
                            documentDrives.push(drive);
                        }
                    } catch (error) {
                        logger.error(error);
                    }
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
    const [status, setStatus] = useAtom(documentDrivesInitialized);

    if (status === 'INITIAL' && reactor) {
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

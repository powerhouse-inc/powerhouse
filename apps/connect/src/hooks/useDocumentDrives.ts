import { useUnwrappedReactor } from '#store';
import type { IDocumentDriveServer } from 'document-drive';
import { type DocumentDriveDocument } from 'document-drive';
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

const FETCH_TIMEOUT = 250;
let timeout: NodeJS.Timeout | undefined;
const listeners = new Array<() => void>();
function waitForResult(
    promise: () => Promise<void>,
    callback: () => void,
    onError: (error: unknown) => void,
) {
    if (timeout) {
        clearTimeout(timeout);
    }
    listeners.push(callback);
    const listenersCopy = [...listeners];
    timeout = setTimeout(() => {
        promise()
            .then(() => {
                while (listenersCopy.length) {
                    const listener = listenersCopy.shift();
                    if (listener) {
                        listener();
                        const index = listeners.indexOf(listener);
                        if (index > -1) {
                            listeners.splice(index, 1);
                        }
                    }
                }
            })
            .catch(onError);
    }, FETCH_TIMEOUT);
}

async function fetchDocumentdrives(reactor: IDocumentDriveServer) {
    const documentDrives: DocumentDriveDocument[] = [];

    const driveIds = (await reactor.getDrives()) ?? [];
    for (const id of driveIds) {
        try {
            const drive = await reactor.getDrive(id);
            if (!drive) {
                continue;
            }
            documentDrives.push(drive);
        } catch (error) {
            console.error(error);
        }
    }
    return documentDrives;
}

export function useDocumentDrives() {
    const reactor = useUnwrappedReactor();
    const [documentDrives, setDocumentDrives] = useAtom(
        useMemo(readWriteDocumentDrivesAtom(reactor), [reactor]),
    );

    const refreshDocumentDrives = useCallback(async () => {
        if (!reactor) {
            return;
        }

        return new Promise<void>((resolve, reject) => {
            waitForResult(
                () =>
                    fetchDocumentdrives(reactor)
                        .then(documentDrives => {
                            setDocumentDrives(documentDrives);
                        })
                        .catch(reject),
                resolve,
                reject,
            );
        });
    }, [reactor]);

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
            const unsubSyncStatus = reactor.on(
                'syncStatus',
                async (_event, _status, error) => {
                    if (error) {
                        console.error(error);
                    }
                    if (error) await refreshDocumentDrives();
                },
            );
            const unsubStrandUpdate = reactor.on('strandUpdate', () =>
                refreshDocumentDrives(),
            );
            const unsubDriveAdded = reactor.on('driveAdded', () =>
                refreshDocumentDrives(),
            );
            const unsubDriveDeleted = reactor.on('driveDeleted', () =>
                refreshDocumentDrives(),
            );
            const unsubDriveOperations = reactor.on(
                'driveOperationsAdded',
                () => refreshDocumentDrives(),
            );
            const unsubOnSyncError = reactor.on(
                'clientStrandsError',
                clientErrorhandler.strandsErrorHandler,
            );
            const unsubDefaultRemoteDrive = reactor.on(
                'defaultRemoteDrive',
                () => refreshDocumentDrives(),
            );

            return () => {
                unsubStrandUpdate();
                unsubSyncStatus();
                unsubDriveAdded();
                unsubDriveDeleted();
                unsubDriveOperations();
                unsubOnSyncError();
                unsubDefaultRemoteDrive();
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

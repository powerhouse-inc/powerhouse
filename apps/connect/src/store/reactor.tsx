import connectConfig from '#connect-config';
import { createBrowserDocumentDriveServer, createBrowserStorage } from '#utils';
import {
    atomStore,
    useUnwrappedDrives,
    useUnwrappedReactor,
} from '@powerhousedao/state';
import { type IDocumentDriveServer, logger } from 'document-drive';
import {
    type IDocumentAdminStorage,
    type IDocumentOperationStorage,
    type IDocumentStorage,
    type IDriveOperationStorage,
} from 'document-drive/storage/types';
import { generateId } from 'document-model';
import { atom, useAtomValue } from 'jotai';
import { observe } from 'jotai-effect';
import { useEffect, useRef } from 'react';
import { getConnectCrypto } from '../hooks/useConnectCrypto.js';
import { renownAtom, renownStatusAtom } from '../hooks/useRenown.js';
import { documentModelsAtom } from './document-model.js';

async function initReactor(reactor: IDocumentDriveServer) {
    await initJwtHandler(reactor);
    const errors = await reactor.initialize();
    const error = errors?.at(0);
    if (error) {
        throw error;
    }
}

export function useCreateFirstLocalDrive() {
    const localDrivesEnabled = connectConfig.drives.sections.LOCAL.enabled;
    const reactor = useUnwrappedReactor();
    const drives = useUnwrappedDrives();
    const hasHandledCreateFirstLocalDrive = useRef(false);

    useEffect(() => {
        if (hasHandledCreateFirstLocalDrive.current) return;
        if (!localDrivesEnabled) return;
        if (reactor === undefined) return;
        if (drives === undefined) return;
        if (drives.length > 0) return;

        reactor
            .addDrive({
                id: generateId(),
                slug: 'my-local-drive',
                global: {
                    name: 'My Local Drive',
                    icon: null,
                },
                local: {
                    availableOffline: false,
                    sharingType: 'private',
                    listeners: [],
                    triggers: [],
                },
            })
            .catch(logger.error);

        hasHandledCreateFirstLocalDrive.current = true;
    }, [localDrivesEnabled, reactor, drives]);
}

async function initJwtHandler(server: IDocumentDriveServer) {
    const renown = await atomStore.get(renownAtom);
    const user = await renown?.user();
    const crypto = await getConnectCrypto();

    if (user?.address) {
        server.setGenerateJwtHandler(async driveUrl => {
            return crypto.getBearerToken(driveUrl, user.address);
        });
    }
}

// Helper function to wait for renown to be initialized
async function waitForRenown(): Promise<void> {
    let unsubscribe: (() => void) | undefined;

    // Wait for renown status to be 'finished'
    return Promise.race([
        new Promise<void>((resolve, reject) => {
            unsubscribe = observe(get => {
                try {
                    const status = get(renownStatusAtom);
                    if (status === 'finished' || status === 'error') {
                        resolve();
                    }
                } catch (err) {
                    // In case of any error during the observation, proceed with reactor initialization
                    reject(
                        new Error(
                            `Error observing renown status: ${
                                err instanceof Error
                                    ? err.message
                                    : 'Unknown error'
                            }`,
                        ),
                    );
                }
            }, atomStore);
            return () => unsubscribe?.();
        }),
        new Promise<void>((_, reject) => {
            // Set a maximum timeout (5 seconds) to avoid blocking indefinitely
            setTimeout(() => {
                unsubscribe?.();
                reject(new Error('Timed out waiting for renown to initialize'));
            }, 5000);
        }),
    ]).catch((error: unknown) => {
        unsubscribe?.();
        logger.warn(error);
    });
}

export async function createReactor() {
    await waitForRenown();
    // get storage
    const storage = atomStore.get(storageAtom);

    // waits for document models to be loaded
    const documentModels = await atomStore.get(documentModelsAtom);
    const server =
        (window.electronAPI?.documentDrive as
            | IDocumentDriveServer
            | undefined) ??
        createBrowserDocumentDriveServer(documentModels, storage);
    await initReactor(server);
    return server;
}

export const storageAtom = atom<
    IDriveOperationStorage &
        IDocumentOperationStorage &
        IDocumentStorage &
        IDocumentAdminStorage
>(createBrowserStorage(connectConfig.routerBasename));
storageAtom.debugLabel = 'storageAtomInConnect';

export const useDocumentAdminStorage = (): IDocumentAdminStorage =>
    useAtomValue(storageAtom);

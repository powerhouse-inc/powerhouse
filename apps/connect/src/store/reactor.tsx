import connectConfig from '#connect-config';
import { createBrowserDocumentDriveServer, createBrowserStorage } from '#utils';
import { atomStore, baseDocumentModelModules } from '@powerhousedao/common';
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
import { getConnectCrypto } from '../hooks/useConnectCrypto.js';
import { renownAtom, renownStatusAtom } from '../hooks/useRenown.js';

async function initReactor(reactor: IDocumentDriveServer) {
    await initJwtHandler(reactor);

    const errors = await reactor.initialize();
    const error = errors?.at(0);
    if (error) {
        throw error;
    }

    const drives = await reactor.getDrives();
    if (!drives.length && connectConfig.drives.sections.LOCAL.enabled) {
        return reactor
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
    }
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
    // await waitForRenown();
    // get storage
    const storage = atomStore.get(storageAtom);

    const reactor =
        (window.electronAPI?.documentDrive as
            | IDocumentDriveServer
            | undefined) ??
        createBrowserDocumentDriveServer(baseDocumentModelModules, storage);
    await initReactor(reactor);
    return reactor;
}

export const storageAtom = atom<
    IDriveOperationStorage &
        IDocumentOperationStorage &
        IDocumentStorage &
        IDocumentAdminStorage
>(createBrowserStorage(connectConfig.routerBasename));
storageAtom.debugLabel = 'storageAtom';

export const useDocumentAdminStorage = (): IDocumentAdminStorage =>
    useAtomValue(storageAtom);

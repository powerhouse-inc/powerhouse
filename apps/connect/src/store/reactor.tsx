import connectConfig from '#connect-config';
import { createBrowserDocumentDriveServer, createBrowserStorage } from '#utils';
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
import { atomWithLazy, unwrap } from 'jotai/utils';
import { getConnectCrypto } from '../hooks/useConnectCrypto.js';
import { renownAtom, renownStatusAtom } from '../hooks/useRenown.js';
import {
    documentModelsAtom,
    subscribeDocumentModels,
} from './document-model.js';
import { atomStore } from './index.js';

async function initReactor(reactor: IDocumentDriveServer) {
    await initJwtHandler(reactor);

    const errors = await reactor.initialize();
    const error = errors?.at(0);
    // await new Promise(resolve => setTimeout(resolve, 10000));
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

async function createReactor() {
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
export const reactorAtom = atomWithLazy<Promise<IDocumentDriveServer>>(() =>
    createReactor(),
);
export const unwrappedReactor = unwrap(reactorAtom);

// blocks rendering until reactor is initialized.
export const useReactor = (): IDocumentDriveServer | undefined =>
    useAtomValue(reactorAtom);

export const useDocumentAdminStorage = (): IDocumentAdminStorage =>
    useAtomValue(storageAtom);

// will return undefined until reactor is initialized. Does not block rendering.
export const useUnwrappedReactor = (): IDocumentDriveServer | undefined =>
    useAtomValue(unwrappedReactor);

// will return undefined until reactor is initialized. Does not block rendering or trigger the reactor to be initialized.
export const useAsyncReactor = (): IDocumentDriveServer | undefined =>
    useAtomValue(reactorAsyncAtom);

const reactorAsyncAtom = atom<IDocumentDriveServer | undefined>(undefined);
reactorAsyncAtom.onMount = setAtom => {
    subscribeReactor(setAtom);
};

// updates the reactor when the available document models change
let documentModelsSubscripion: (() => void) | undefined;
reactorAtom.onMount = setAtom => {
    if (documentModelsSubscripion) return;
    setAtom(async prevReactor => {
        const reactor = await prevReactor;

        if (!documentModelsSubscripion) {
            documentModelsSubscripion = subscribeDocumentModels(
                documentModels => {
                    reactor.setDocumentModelModules(documentModels);
                },
            );
        }
        return reactor;
    });
};

export const subscribeReactor = function (
    listener: (reactor: IDocumentDriveServer) => void,
) {
    // activate the effect on the default store
    const unobserve = observe(get => {
        const reactor = get(reactorAtom);
        reactor.then(listener).catch(e => {
            throw e;
        });
    }, atomStore);

    // Clean up the effect
    return () => unobserve();
};

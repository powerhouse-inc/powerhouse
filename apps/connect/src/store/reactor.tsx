import connectConfig from '#connect-config';
import { createBrowserDocumentDriveServer, createBrowserStorage } from '#utils';
import { type IDocumentDriveServer, logger } from 'document-drive';
import { IDocumentAdminStorage, IDocumentOperationStorage, IDocumentStorage, IDriveOperationStorage } from 'document-drive/storage/types';
import { hashKey } from 'document-model';
import { atom, useAtomValue } from 'jotai';
import { atomWithLazy, unwrap } from 'jotai/utils';
import {
    documentModelsAtom,
    subscribeDocumentModels,
} from './document-model.js';
import { atomStore } from './index.js';

async function initReactor(reactor: IDocumentDriveServer) {
    const errors = await reactor.initialize();
    const error = errors?.at(0);
    if (error) {
        throw error;
    }

    const drives = await reactor.getDrives();
    if (!drives.length && connectConfig.drives.sections.LOCAL.enabled) {
        return reactor
            .addDrive({
                global: {
                    id: hashKey(),
                    name: 'My Local Drive',
                    icon: null,
                    slug: 'my-local-drive',
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

async function createReactor() {
    // get storage
    const storage = atomStore.get(storageAtom);

    // waits for document models to be loaded
    const documentModels = await atomStore.get(documentModelsAtom);
    const server =
        (window.electronAPI?.documentDrive as unknown as
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
export const reactorAtom = atomWithLazy<Promise<IDocumentDriveServer>>(
    () => createReactor(),
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
    const baseOnMount = reactorAtom.onMount;
    reactorAtom.onMount = setReactorAtom => {
        setReactorAtom(reactorPromise => {
            reactorPromise
                .then(reactor => setAtom(reactor))
                .catch(console.error);
            return reactorPromise;
        });
        return baseOnMount?.(setReactorAtom);
    };
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

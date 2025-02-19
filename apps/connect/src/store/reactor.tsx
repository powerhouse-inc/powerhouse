import { logger } from '#services/logger';
import {
    documentModelsAtom,
    subscribeDocumentModels,
} from '#store/document-model';
import { createBrowserDocumentDriveServer } from '#utils/reactor';
import connectConfig from 'connect-config';
import { type IDocumentDriveServer } from 'document-drive';
import { hashKey } from 'document-model';
import { atom, useAtomValue } from 'jotai';
import { atomWithLazy, unwrap } from 'jotai/utils';
import { atomStore } from '.';

async function initReactor(reactor: IDocumentDriveServer) {
    const errors = await reactor.initialize();
    const error = errors?.at(0);
    if (error) {
        throw error;
    }

    const drives = await reactor.getDrives();
    if (!drives.length && connectConfig.drives.sections.LOCAL.enabled) {
        reactor
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
    // waits for document models to be loaded
    const documentModels = await atomStore.get(documentModelsAtom);
    const server =
        (window.electronAPI?.documentDrive as unknown as
            | IDocumentDriveServer
            | undefined) ??
        createBrowserDocumentDriveServer(
            documentModels,
            connectConfig.routerBasename,
        );
    await initReactor(server);
    return server;
}

const reactorAtom = atomWithLazy<Promise<IDocumentDriveServer>>(createReactor);
const unwrappedReactor = unwrap(reactorAtom);

// blocks rendering until reactor is initialized.
export const useReactor = () => useAtomValue(reactorAtom);

// will return undefined until reactor is initialized. Does not block rendering.
export const useUnwrappedReactor = () => useAtomValue(unwrappedReactor);

// will return undefined until reactor is initialized. Does not block rendering or trigger the reactor to be initialized.
export const useAsyncReactor = () => useAtomValue(reactorAsyncAtom);

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
                    reactor.setDocumentModels(documentModels);
                },
            );
        }
        return reactor;
    });
};

import connectConfig from 'connect-config';
import { type IDocumentDriveServer } from 'document-drive';
import { utils } from 'document-model/document';
import { atom, useAtomValue } from 'jotai';
import { unwrap } from 'jotai/utils';
import { logger } from 'src/services/logger';
import {
    documentModelsAtom,
    subscribeDocumentModels,
} from 'src/store/document-model';
import { createBrowserDocumentDriveServer } from 'src/utils/reactor';
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
                    id: utils.hashKey(),
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

const reactor = (async () => {
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
})();

const reactorAtom = atom<Promise<IDocumentDriveServer>>(reactor);
const unwrappedReactor = unwrap(reactorAtom);

// blocks rendering until reactor is initialized.
export const useReactor = () => useAtomValue(reactorAtom);

// will return undefined until reactor is initialized. Does not block rendering.
export const useUnwrappedReactor = () => useAtomValue(unwrappedReactor);

// returns promise that will resolve when reactor is initialized.
export const useReactorAsync = () => {
    return reactor;
};

// updates reactor document models when they change.
subscribeDocumentModels(async documentModels => {
    const reactor = await atomStore.get(reactorAtom);
    reactor.setDocumentModels(documentModels);
});

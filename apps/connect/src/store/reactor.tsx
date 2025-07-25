import connectConfig from '#connect-config';
import { type IRenown } from '#services';
import { createBrowserDocumentDriveServer, createBrowserStorage } from '#utils';
import { useDrives, useReactor } from '@powerhousedao/state';
import { type IDocumentDriveServer, logger } from 'document-drive';
import {
    type IDocumentAdminStorage,
    type IDocumentOperationStorage,
    type IDocumentStorage,
    type IDriveOperationStorage,
} from 'document-drive/storage/types';
import { type DocumentModelModule, generateId } from 'document-model';
import { atom, useAtomValue } from 'jotai';
import { useEffect, useRef } from 'react';
import { getConnectCrypto } from '../hooks/useConnectCrypto.js';

async function initReactor(
    reactor: IDocumentDriveServer,
    renown: IRenown | undefined,
) {
    await initJwtHandler(reactor, renown);
    const errors = await reactor.initialize();
    const error = errors?.at(0);
    if (error) {
        throw error;
    }
}

export function useCreateFirstLocalDrive() {
    const localDrivesEnabled = connectConfig.drives.sections.LOCAL.enabled;
    const reactor = useReactor();
    const drives = useDrives();
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

async function initJwtHandler(
    server: IDocumentDriveServer,
    renown: IRenown | undefined,
) {
    const user = await renown?.user();
    const crypto = await getConnectCrypto();

    if (user?.address) {
        server.setGenerateJwtHandler(async driveUrl => {
            return crypto.getBearerToken(driveUrl, user.address);
        });
    }
}

export async function createReactor(
    storage: IDriveOperationStorage &
        IDocumentOperationStorage &
        IDocumentStorage &
        IDocumentAdminStorage,
    documentModels: DocumentModelModule[],
    renown: IRenown | undefined,
) {
    const reactor = createBrowserDocumentDriveServer(documentModels, storage);
    await initReactor(reactor, renown);
    return reactor;
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

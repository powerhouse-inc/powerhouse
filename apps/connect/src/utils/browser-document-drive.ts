import connectConfig from 'connect-config';
import InMemoryCache from 'document-drive/cache/memory';
import { BaseQueueManager } from 'document-drive/queue/base';
import { DocumentDriveServer } from 'document-drive/server';
import { BrowserStorage } from 'document-drive/storage/browser';
import { utils } from 'document-model/document';
import { logger } from 'src/services/logger';
import { documentModels } from 'src/store/document-model';
import { getReactorDefaultDrivesConfig } from './reactor';

export const BrowserDocumentDriveServer = new DocumentDriveServer(
    documentModels,
    new BrowserStorage(connectConfig.routerBasename),
    new InMemoryCache(),
    new BaseQueueManager(1, 10),
    { ...getReactorDefaultDrivesConfig() },
);

async function init() {
    try {
        await BrowserDocumentDriveServer.initialize();
        const drives = await BrowserDocumentDriveServer.getDrives();
        if (!drives.length && connectConfig.drives.sections.LOCAL.enabled) {
            BrowserDocumentDriveServer.addDrive({
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
            }).catch(logger.error);
        }
    } catch (e) {
        logger.error(e);
    }
}

init().catch(logger.error);

import { DocumentDriveServer } from 'document-drive/server';
import { BrowserStorage } from 'document-drive/storage/browser';
import { utils } from 'document-model/document';
import { documentModels } from 'src/store/document-model';

export const BrowserDocumentDriveServer = new DocumentDriveServer(
    documentModels,
    new BrowserStorage(),
);

BrowserDocumentDriveServer.initialize()
    .then(() =>
        BrowserDocumentDriveServer.getDrives()
            .then(drives => {
                if (!drives.length) {
                    BrowserDocumentDriveServer.addDrive({
                        global: {
                            id: utils.hashKey(),
                            name: 'My Local Device',
                            icon: null,
                            slug: null,
                        },
                        local: {
                            availableOffline: false,
                            sharingType: 'private',
                            listeners: [],
                            triggers: [],
                        },
                    }).catch(console.error);
                }
            })
            .catch(console.error),
    )
    .catch(console.error);

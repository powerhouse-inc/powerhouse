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
                            remoteUrl: null,
                        },
                        local: {
                            availableOffline: false,
                            sharingType: 'shared',
                            listeners: [],
                        },
                    }).catch(console.error);
                }
            })
            .catch(console.error),
    )
    .catch(console.error);

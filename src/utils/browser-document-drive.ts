import { DocumentDriveServer } from 'document-drive/server';
import { BrowserStorage } from 'document-drive/storage/browser';
import { utils } from 'document-model/document';
import { documentModels } from 'src/store/document-model';

export const BrowserDocumentDriveServer = new DocumentDriveServer(
    documentModels,
    new BrowserStorage()
);

BrowserDocumentDriveServer.getDrives().then(drives => {
    if (!drives.length) {
        BrowserDocumentDriveServer.addDrive({
            global: {
                id: utils.hashKey(),
                name: 'Powerhouse',
                icon: null,
                remoteUrl: 'FAKE_URL',
            },
            local: {
                availableOffline: false,
                sharingType: 'shared',
            },
        });
    }
});

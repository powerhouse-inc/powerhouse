import { DocumentDriveServer } from 'document-drive/server';
import { BrowserStorage } from 'document-drive/storage/browser';
import { documentModels } from 'src/store/document-model';

export const BrowserDocumentDriveServer = new DocumentDriveServer(
    documentModels,
    new BrowserStorage()
);

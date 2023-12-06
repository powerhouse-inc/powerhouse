import { BrowserStorage, DocumentDriveServer } from 'document-drive';
import { documentModels } from 'src/store/document-model';

export const BrowserDocumentDriveServer = new DocumentDriveServer(
    documentModels,
    new BrowserStorage()
);

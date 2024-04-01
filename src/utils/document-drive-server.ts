import type { IDocumentDriveServer } from 'document-drive/server';
import { BrowserDocumentDriveServer } from 'src/utils/browser-document-drive';

export const DefaultDocumentDriveServer = (window.electronAPI?.documentDrive ??
    BrowserDocumentDriveServer) as IDocumentDriveServer;

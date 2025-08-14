import { type IDocumentDriveServer } from 'document-drive';
import {
    type IDocumentAdminStorage,
    type IDocumentOperationStorage,
    type IDocumentStorage,
    type IDriveOperationStorage,
} from 'document-drive/storage/types';
import type { ElectronAPI } from './preload.js';
import type { IConnectCrypto } from './services/crypto/index.js';
import type { IRenown } from './services/renown/types.js';
import type { DocumentEditorDebugTools } from './utils/document-editor-debug-tools.js';

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
        connectCrypto?: IConnectCrypto;
        renown?: IRenown;
        documentEditorDebugTools?: DocumentEditorDebugTools;
        reactor?: IDocumentDriveServer;
        phStorage?: IDriveOperationStorage &
            IDocumentOperationStorage &
            IDocumentStorage &
            IDocumentAdminStorage;
    }

    const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
    const MAIN_WINDOW_VITE_NAME: string;
}

import { type UserPermissions } from '@powerhousedao/reactor-browser';
import {
    type DID,
    type IConnectCrypto,
} from '@powerhousedao/reactor-browser/crypto/index';
import { type IRenown, type User } from '@renown/sdk';
import { type IDocumentDriveServer } from 'document-drive';
import {
    type IDocumentAdminStorage,
    type IDocumentOperationStorage,
    type IDocumentStorage,
    type IDriveOperationStorage,
} from 'document-drive/storage/types';
// import type { ElectronAPI } from './preload.js';
import type { DocumentEditorDebugTools } from './utils/document-editor-debug-tools.js';

declare global {
    interface Window {
        // electronAPI?: ElectronAPI;
        connectCrypto?: IConnectCrypto;
        did?: DID;
        renown?: IRenown;
        user?: User | undefined;

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

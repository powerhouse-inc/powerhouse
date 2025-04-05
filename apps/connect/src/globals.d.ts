import type { ElectronAPI } from './preload.js';
import type { IConnectCrypto } from './services/crypto/index.js';
import type { IRenown } from './services/renown/types.js';
import type { DocumentEditorDebugTools } from './utils/document-editor-debug-tools.js';
export {};

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
        connectCrypto?: IConnectCrypto;
        renown?: IRenown;
        documentEditorDebugTools?: DocumentEditorDebugTools;
    }

    const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
    const MAIN_WINDOW_VITE_NAME: string;
}

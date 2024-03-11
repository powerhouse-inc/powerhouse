import type { ElectronAPI } from './preload';
import type { IConnectCrypto } from './services/crypto';
import { DocumentEditorDebugTools } from './utils/document-editor-debug-tools';
export {};

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
        connectCrypto?: IConnectCrypto;
        documentEditorDebugTools?: DocumentEditorDebugTools;
    }

    const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
    const MAIN_WINDOW_VITE_NAME: string;
}

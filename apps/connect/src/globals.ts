// import type { ElectronAPI } from './preload.js';
import type { DocumentEditorDebugTools } from './utils/document-editor-debug-tools.js';

declare global {
    interface Window {
        documentEditorDebugTools?: DocumentEditorDebugTools;
    }

    const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
    const MAIN_WINDOW_VITE_NAME: string;
}

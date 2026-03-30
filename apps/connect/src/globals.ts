import type { DocumentEditorDebugTools } from "./utils/document-editor-debug-tools.js";

declare global {
  interface Window {
    documentEditorDebugTools?: DocumentEditorDebugTools;
  }
  const PH_PACKAGE_REGISTRY_URL: string | null;
  const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
  const MAIN_WINDOW_VITE_NAME: string;
}

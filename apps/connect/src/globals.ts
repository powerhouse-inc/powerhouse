import type { DocumentEditorDebugTools } from "@powerhousedao/connect";

declare global {
  interface Window {
    documentEditorDebugTools?: DocumentEditorDebugTools;
  }

  const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
  const MAIN_WINDOW_VITE_NAME: string;
}

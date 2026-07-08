import type { DocumentEditorDebugTools } from "./utils/document-editor-debug-tools.js";

declare global {
  // File Handling API (https://wicg.github.io/manifest-incubations/) — files
  // the OS hands to the installed PWA via the manifest's file_handlers.
  // lib.dom has FileSystemHandle/FileSystemFileHandle but not these two.
  interface LaunchParams {
    readonly files: readonly FileSystemHandle[];
  }
  interface LaunchQueue {
    setConsumer(consumer: (params: LaunchParams) => void): void;
  }

  interface Window {
    documentEditorDebugTools?: DocumentEditorDebugTools;
    /** Chromium-only; launches are buffered until a consumer is set. */
    launchQueue?: LaunchQueue;
  }
  const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
  const MAIN_WINDOW_VITE_NAME: string;
}

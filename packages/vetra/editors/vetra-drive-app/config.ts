import type { PHDriveEditorConfig } from "@powerhousedao/reactor-browser";

export const editorConfig: PHDriveEditorConfig = {
  allowedDocumentTypes: [
    "powerhouse/document-model",
    "powerhouse/app",
    "powerhouse/document-editor",
    "powerhouse/processor",
    "powerhouse/subgraph",
    "powerhouse/package",
  ],
  isDragAndDropEnabled: true,
};

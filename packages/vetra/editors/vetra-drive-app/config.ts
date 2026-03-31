import type { PHAppConfig } from "@powerhousedao/reactor-browser";

export const editorConfig: PHAppConfig = {
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

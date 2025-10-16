import type { PHGlobalEditorConfig } from "@powerhousedao/reactor-browser";

export const editorConfig: PHGlobalEditorConfig = {
  allowedDocumentTypes: [
    "powerhouse/document-model",
    "powerhouse/app",
    "powerhouse/document-editor",
    "powerhouse/processor",
    "powerhouse/subgraph",
    "powerhouse/package",
  ],
};

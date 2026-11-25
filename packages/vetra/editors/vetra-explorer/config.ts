import type { PHAppConfig } from "@powerhousedao/reactor-browser";
import { EXPLORER_DOCUMENT_TYPES } from "./layout.js";

export const editorConfig: PHAppConfig = {
  allowedDocumentTypes: [...EXPLORER_DOCUMENT_TYPES],
  isDragAndDropEnabled: true,
};

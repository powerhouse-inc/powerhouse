---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/config.ts"
unless_exists: true
---
import type { PHDriveEditorConfig } from "@powerhousedao/reactor-browser";

/** Editor config for the <%= pascalCaseDriveEditorName %> */
export const editorConfig: PHDriveEditorConfig = {
  isDragAndDropEnabled: <%- isDragAndDropEnabled %>,
  allowedDocumentTypes: <%- allowedDocumentTypes %>
};
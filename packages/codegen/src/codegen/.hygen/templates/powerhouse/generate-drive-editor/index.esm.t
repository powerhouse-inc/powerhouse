---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/index.ts"
force: true
---
import { type DriveEditorModule } from "@powerhousedao/reactor-browser";
import Editor from "./editor.js";

export const module: DriveEditorModule = {
  Component: Editor,
  documentTypes: ["powerhouse/document-drive"],
  config: {
    id: "<%= appId || 'drive-editor-id' %>",
    disableExternalControls: true,
    documentToolbarEnabled: true,
    showSwitchboardLink: true,<%_ if (dragAndDropEnabled) { _%>
    documentTypes: [<%- (dragAndDropDocumentTypes ? JSON.parse(dragAndDropDocumentTypes) : []).map(type => JSON.stringify(type)).join(', ') %>],
    dragAndDrop: {
      enabled: true,
    },<%_ } _%>
  },
};

export default module;

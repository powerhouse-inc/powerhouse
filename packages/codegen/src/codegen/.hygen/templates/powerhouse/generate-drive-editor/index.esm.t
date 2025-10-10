---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/index.ts"
force: true
---
import { type EditorModule } from "document-model";
import { Editor } from "./editor.js";

export const module: EditorModule = {
  Component: Editor,
  documentTypes: ["powerhouse/document-drive"],
  config: {
    id: "<%= appId || 'drive-editor-id' %>",
    name: "<%= name || 'YOUR_APP_NAME' %>",
    <%_ if (dragAndDropEnabled) { _%>
    documentTypes: [<%- (dragAndDropDocumentTypes ? JSON.parse(dragAndDropDocumentTypes) : []).map(type => JSON.stringify(type)).join(', ') %>],<%_ } _%>
  },
};

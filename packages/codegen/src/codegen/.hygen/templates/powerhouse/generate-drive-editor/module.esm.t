---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/module.ts"
force: true
---
import { type EditorModule } from "document-model";
import { Editor } from "./editor.js";

export const <%= pascalCaseDriveEditorName %>: EditorModule = {
  Component: Editor,
  documentTypes: ["powerhouse/document-drive"],
  config: {
    id: "<%= appId || paramCaseDriveEditorName %>",
    name: "<%= name %>",
  },
};

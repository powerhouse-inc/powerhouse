---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/module.ts"
force: true
---
import { type EditorModule } from "document-model";
import { lazy } from "react";

export const <%= pascalCaseDriveEditorName %>: EditorModule = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["powerhouse/document-drive"],
  config: {
    id: "<%= appId || paramCaseDriveEditorName %>",
    name: "<%= name %>",
  },
};

import { tsx } from "@tmpl/core";

export const documentEditorModuleFileTemplate = (v: {
  editorName: string;
  pascalCaseEditorName: string;
  editorId: string;
  documentTypes: string;
}) =>
  tsx`
import type { EditorModule } from "document-model";
import { lazy } from "react";

/** Document editor module for the "${v.documentTypes}" document type */
export const ${v.pascalCaseEditorName}: EditorModule = {
    Component: lazy(() => import("./editor.js")),
    documentTypes: ${v.documentTypes},
    config: {
        id: "${v.editorId}",
        name: "${v.editorName}",
    },
};
`.raw;

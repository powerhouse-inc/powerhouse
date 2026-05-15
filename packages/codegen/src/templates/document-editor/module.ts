import { tsx } from "@tmpl/core";

export const documentEditorModuleFileTemplate = (v: {
  editorName: string;
  pascalCaseEditorName: string;
  editorId: string;
  documentTypes: string[];
}) => {
  const documentTypesLiteral = JSON.stringify(v.documentTypes);
  const docComment =
    v.documentTypes.length === 1
      ? `Document editor module for the "${v.documentTypes[0]}" document type`
      : `Document editor module for document types: ${v.documentTypes.map((t) => `"${t}"`).join(", ")}`;
  return tsx`
/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { EditorModule } from "document-model";
import { lazy } from "react";

/** ${docComment} */
export const ${v.pascalCaseEditorName}: EditorModule = {
    Component: lazy(() => import("./editor.js")),
    documentTypes: ${documentTypesLiteral},
    config: {
        id: "${v.editorId}",
        name: "${v.editorName}",
    },
};
`.raw;
};

import { tsx } from "@tmpl/core";

export const documentEditorModuleFileTemplate = (v: {
  editorName: string;
  pascalCaseEditorName: string;
  editorId: string;
  documentTypes: string[];
  /** Types the module for its document; drive apps and multi-type editors omit it. */
  documentModel?: {
    documentTypeName: string;
    actionTypeName: string;
    importPath: string;
  };
}) => {
  const model = v.documentModel;
  const modelTypeImport = model
    ? `import type { ${model.actionTypeName}, ${model.documentTypeName} } from "${model.importPath}";`
    : "";
  const typeArguments = model
    ? `<${model.documentTypeName}, ${model.actionTypeName}>`
    : "";
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
${modelTypeImport}
import { lazy } from "react";

/** ${docComment} */
export const ${v.pascalCaseEditorName}: EditorModule${typeArguments} = {
    Component: lazy(() => import("./editor.js")),
    documentTypes: ${documentTypesLiteral},
    config: {
        id: "${v.editorId}",
        name: "${v.editorName}",
    },
};
`.raw;
};

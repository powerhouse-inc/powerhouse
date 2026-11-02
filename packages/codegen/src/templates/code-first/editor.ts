import { ts, tsx } from "@tmpl/core";

export type CodeFirstEditorTemplateArgs = {
  readonly exportName: string;

  readonly importPath: string;
};

/**
 * The templates' own name for the imported model. An export name may equal a
 * name a template declares, such as `Editor`, `useState` or the editor module,
 * so it appears only in the import specifier. No template declares this name,
 * and a pascalCase editor module name cannot start with a lowercase letter.
 */
const MODEL = "documentModel";

const importModel = ({ exportName }: CodeFirstEditorTemplateArgs) =>
  exportName === MODEL ? MODEL : `${exportName} as ${MODEL}`;

export const codeFirstEditorTemplate = (v: CodeFirstEditorTemplateArgs) =>
  tsx`
import { DocumentStateViewer, DocumentToolbar } from "@powerhousedao/design-system/connect";
import type { ActionOf, DocumentOf, EditorProps } from "document-model";
import { useState } from "react";
import { ${importModel(v)} } from "${v.importPath}";

export default function Editor({
  document,
  dispatch,
}: EditorProps<DocumentOf<typeof ${MODEL}>, ActionOf<typeof ${MODEL}>>) {
  const [rejection, setRejection] = useState<string>();

  const handleSetName = (name: string) => {
    setRejection(undefined);
    dispatch(${MODEL}.actions.setName(name), (errors) => setRejection(errors[0]?.message));
  };

  return (
    <div className="mx-auto max-w-4xl bg-background p-6">
      <DocumentToolbar document={document} />

      {/* "ph-default-styles" sets default styles for basic UI elements */}
      <div className="ph-default-styles">
        <label className="my-6">
          <h3>Document Name</h3>
          <input
            type="text"
            defaultValue={document.header.name}
            placeholder="Enter document name..."
            title="Edit document name and click outside to save."
            autoFocus
            onBlur={(e) => handleSetName(e.target.value.trim())}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            className="font-semibold"
          />
        </label>
        {rejection && (
          <p role="alert" className="text-red-700">
            {rejection}
          </p>
        )}
        <hr />

        <div className="mt-6">
          <h3 className="text-base">Document State</h3>
          <DocumentStateViewer state={document.state} />
        </div>
      </div>
    </div>
  );
}
`.raw;

export const codeFirstEditorModuleTemplate = (
  v: CodeFirstEditorTemplateArgs & {
    readonly editorName: string;
    readonly pascalCaseEditorName: string;
    readonly editorId: string;
    readonly documentType: string;
  },
) =>
  ts`
/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type * as documentModelTypes from "document-model";
import { lazy } from "react";
import type { ${importModel(v)} } from "${v.importPath}";

/** Document editor module for the ${JSON.stringify(v.documentType)} document type */
export const ${v.pascalCaseEditorName}: documentModelTypes.EditorModule<
  documentModelTypes.DocumentOf<typeof ${MODEL}>,
  documentModelTypes.ActionOf<typeof ${MODEL}>
> = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: [${JSON.stringify(v.documentType)}],
  config: {
    id: ${JSON.stringify(v.editorId)},
    name: ${JSON.stringify(v.editorName)},
  },
};
`.raw;

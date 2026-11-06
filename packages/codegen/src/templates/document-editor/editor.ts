import type { EditorVariableNames } from "@powerhousedao/codegen";
import { tsx } from "@tmpl/core";
import { documentHeaderInfo } from "./header-info.js";

export const documentEditorEditorFileTemplate = (
  v: EditorVariableNames & {
    documentModelImportPath: string;
  },
) =>
  tsx`
import { DocumentStateViewer, DocumentToolbar } from "@powerhousedao/design-system/connect";
import type { EditorProps } from "document-model";
import type {
  ${v.actionTypeName},
  ${v.documentModelDocumentTypeName},
} from "${v.documentModelImportPath}";
import { actions } from "${v.documentModelImportPath}";
import { useState } from "react";

export default function Editor({
  document,
  dispatch,
}: EditorProps<${v.documentModelDocumentTypeName}, ${v.actionTypeName}>) {
  // The reducer's message for the last action the document rejected
  const [error, setError] = useState<string>();

  const handleSetName = (name: string) => {
    setError(undefined);
    // 'actions' contains all available actions for this document type
    dispatch(actions.setName(name), (errors) => setError(errors[0]?.message));
  };

  return (
    <div className="mx-auto max-w-4xl bg-background p-6">
      <DocumentToolbar document={document} />

      {/* "ph-default-styles" sets default styles for basic UI elements */}
      <div className="ph-default-styles">
        {/* Edit document name */}
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
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <hr />

        ${documentHeaderInfo}

        {/* Document state. For its history use useDocumentOperations(document.header.id, "global"), not document.operations */}
        <div className="mt-6">
          <h3 className="text-base">Document State</h3>
          <DocumentStateViewer state={document.state} />
        </div>
      </div>
    </div>
  );
}
`.raw;

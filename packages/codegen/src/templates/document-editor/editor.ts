import type { EditorVariableNames } from "@powerhousedao/codegen";
import { tsx } from "@tmpl/core";

export const documentEditorEditorFileTemplate = (
  v: EditorVariableNames & {
    documentModelImportPath: string;
  },
) =>
  tsx`
import { DocumentStateViewer, DocumentToolbar } from "@powerhousedao/design-system/connect";
import { ${v.useSelectedDocumentHookName}, actions } from "${v.documentModelImportPath}";

export default function Editor() {
  const [document, dispatch] = ${v.useSelectedDocumentHookName}();

  const handleSetName = (name: string) => {
    // 'actions' contains all available actions for this document type
    dispatch(actions.setName(name));
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <DocumentToolbar />

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
        <hr />

        {/* Document header info */}
        <div className="mb-6 grid grid-cols-2 gap-x-8">
          <label>
            <h3 className="text-base">ID</h3>
            <input
              type="text"
              value={document.header.id}
              readOnly
              className="font-mono"
            />
          </label>
          <label>
            <h3 className="text-base">Created</h3>
            <input
              type="text"
              value={new Date(document.header.createdAtUtcIso).toLocaleString()}
              readOnly
            />
          </label>
          <label>
            <h3 className="text-base">Type</h3>
            <input type="text" value={document.header.documentType} readOnly />
          </label>
          <label>
            <h3 className="text-base">Last Modified</h3>
            <input
              type="text"
              value={new Date(
                document.header.lastModifiedAtUtcIso,
              ).toLocaleString()}
              readOnly
            />
          </label>
        </div>

        {/* Document state */}
        <div className="mt-6">
          <h3 className="text-base">Document State</h3>
          <DocumentStateViewer state={document.state} />
        </div>
      </div>
    </div>
  );
}
`.raw;

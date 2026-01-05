import type { EditorVariableNames } from "@powerhousedao/codegen/ts-morph";
import { tsx } from "@tmpl/core";

export const documentEditorEditorFileTemplate = (
  v: EditorVariableNames & {
    documentModelImportPath: string;
  },
) =>
  tsx`
import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import { setName } from "document-model";
import { type FormEvent, useState } from "react";
import { ${v.useSelectedDocumentHookName} } from "${v.documentModelImportPath}";

export default function Editor() {
  const [document, dispatch] = ${v.useSelectedDocumentHookName}();
  const [isEditing, setIsEditing] = useState(false);

  if (!document) return null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const nameInput = form.elements.namedItem("name") as HTMLInputElement;
    const name = nameInput.value.trim();
    if (!name) return;
    dispatch(setName(name));
    setIsEditing(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <DocumentToolbar />
      <div className="flex justify-center px-4 py-8">
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 text-xs font-medium uppercase tracking-wide text-gray-400">
            ${v.documentModelDocumentTypeName}
          </div>

          {isEditing ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="text"
                name="name"
                defaultValue={document.header.name}
                autoFocus
                className="w-full rounded-lg border border-gray-200 px-4 py-3 text-lg font-semibold text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Enter name..."
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <h2 className="truncate text-xl font-semibold text-gray-900">
                {document.header.name || "Untitled"}
              </h2>
              <button
                onClick={() => setIsEditing(true)}
                className="shrink-0 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
              >
                Edit
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
`.raw;

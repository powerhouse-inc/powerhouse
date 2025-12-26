import { Suspense, useEffect, useState } from "react";
import type {
  AddDocumentTypeInput,
  DocumentTypeItem,
  RemoveDocumentTypeInput,
} from "../../../document-models/document-editor/index.js";
import { StatusPill } from "../../components/index.js";
import { useAvailableDocumentTypes, useDebounce } from "../../hooks/index.js";

export interface DocumentEditorFormProps {
  editorName?: string;
  documentTypes?: DocumentTypeItem[];
  status?: string;
  onEditorNameChange?: (name: string) => void;
  onAddDocumentType?: (input: AddDocumentTypeInput) => void;
  onRemoveDocumentType?: (input: RemoveDocumentTypeInput) => void;
  onConfirm?: () => void;
}

function DocumentTypeSelectUI(
  props: React.SelectHTMLAttributes<HTMLSelectElement>,
) {
  return (
    <select
      id="supported-document-types"
      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
      {...props}
    >
      <option value="">Select a document type</option>
      {props.children}
    </select>
  );
}

function DocumentTypeSelect({
  documentTypes,
  setDocumentTypes,
  onAddDocumentType,
  onRemoveDocumentType,
}: {
  setDocumentTypes: (documentTypes: DocumentTypeItem[]) => void;
} & Pick<
  DocumentEditorFormProps,
  "documentTypes" | "onAddDocumentType" | "onRemoveDocumentType"
>) {
  // Get available document types from the hook (vetra drive only for document editor)
  const availableDocumentTypes = useAvailableDocumentTypes(true);
  const [selectedDocumentType, setSelectedDocumentType] = useState("");

  return (
    <DocumentTypeSelectUI
      value={selectedDocumentType}
      onChange={(e) => {
        const selectedValue = e.target.value;
        if (selectedValue) {
          // Remove existing document type if any

          const existingType = documentTypes?.at(0);
          if (existingType) {
            onRemoveDocumentType?.({ id: existingType.id });
          }

          // Add the new document type
          const newTypeInput: AddDocumentTypeInput = {
            id: Date.now().toString(), // Generate a unique ID
            documentType: selectedValue,
          };
          const newType: DocumentTypeItem = {
            id: newTypeInput.id,
            documentType: newTypeInput.documentType,
          };
          setDocumentTypes([newType]); // Replace with single item array
          onAddDocumentType?.(newTypeInput);
        }
        setSelectedDocumentType("");
      }}
    >
      {availableDocumentTypes.map((docType) => (
        <option key={docType} value={docType}>
          {docType}
        </option>
      ))}
    </DocumentTypeSelectUI>
  );
}

export const DocumentEditorForm: React.FC<DocumentEditorFormProps> = ({
  editorName: initialEditorName = "",
  documentTypes: initialDocumentTypes = [],
  status = "DRAFT",
  onEditorNameChange,
  onAddDocumentType,
  onRemoveDocumentType,
  onConfirm,
}) => {
  const [editorName, setEditorName] = useState(initialEditorName);
  const [documentTypes, setDocumentTypes] =
    useState<DocumentTypeItem[]>(initialDocumentTypes);
  const [isConfirmed, setIsConfirmed] = useState(false);

  // Use the debounce hook for name changes
  useDebounce(editorName, onEditorNameChange, 300);

  // Update local state when initial values change
  useEffect(() => {
    setEditorName(initialEditorName);
  }, [initialEditorName]);

  useEffect(() => {
    setDocumentTypes(initialDocumentTypes);
  }, [initialDocumentTypes]);

  // Reset confirmation state if status changes back to DRAFT
  useEffect(() => {
    if (status === "DRAFT") {
      setIsConfirmed(false);
    }
  }, [status]);

  // Check if form should be read-only
  const isReadOnly = isConfirmed || status === "CONFIRMED";

  const handleConfirm = () => {
    if (editorName.trim() && documentTypes.length > 0) {
      setIsConfirmed(true); // Immediate UI update
      onConfirm?.();
    }
  };

  return (
    <div className="space-y-6 bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">
          Editor Configuration
        </h2>
        <StatusPill
          status={status === "CONFIRMED" ? "confirmed" : "draft"}
          label={status === "CONFIRMED" ? "Confirmed" : "Draft"}
        />
      </div>

      {/* Editor Name Field */}
      <div>
        <label
          htmlFor="editor-name"
          className="mb-2 block text-sm font-medium text-gray-700"
        >
          Editor Name
        </label>
        <input
          id="editor-name"
          type="text"
          value={editorName}
          onChange={(e) => setEditorName(e.target.value)}
          disabled={isReadOnly}
          className={`w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            isReadOnly ? "cursor-not-allowed bg-gray-100" : ""
          }`}
        />
      </div>

      {/* Supported Document Types Field */}
      <div>
        <label
          htmlFor="supported-document-types"
          className="mb-2 block text-sm font-medium text-gray-700"
        >
          Supported Document Types
        </label>
        <div className="space-y-2">
          {!isReadOnly && (
            <Suspense fallback={<DocumentTypeSelectUI />}>
              <DocumentTypeSelect
                documentTypes={documentTypes}
                setDocumentTypes={setDocumentTypes}
                onAddDocumentType={onAddDocumentType}
                onRemoveDocumentType={onRemoveDocumentType}
              />
            </Suspense>
          )}
          <div className="space-y-1">
            {documentTypes.map((type) => (
              <div key={type.id} className="flex items-center py-1">
                <span className="text-sm text-gray-700">
                  {type.documentType}
                </span>
                {!isReadOnly && (
                  <button
                    onClick={() => {
                      setDocumentTypes([]);
                      onRemoveDocumentType?.({ id: type.id });
                    }}
                    className="ml-2 text-gray-400 hover:text-gray-600 focus:outline-none"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Confirm Button - only show if not in read-only mode */}
      {!isReadOnly && (
        <div>
          <button
            onClick={handleConfirm}
            disabled={!editorName.trim() || documentTypes.length === 0}
            className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
};

import { useEffect, useState } from "react";
import type { DocumentTypeItem } from "../../../document-models/app-module/index.js";
import { StatusPill } from "../../components/index.js";
import { useAvailableDocumentTypes, useDebounce } from "../../hooks/index.js";

export interface AppEditorFormProps {
  appName?: string;
  status?: string;
  dragAndDropEnabled?: boolean;
  documentTypes?: DocumentTypeItem[];
  onNameChange?: (name: string) => void;
  onDragAndDropToggle?: (enabled: boolean) => void;
  onAddDocumentType?: (id: string, documentType: string) => void;
  onRemoveDocumentType?: (id: string) => void;
  onConfirm?: () => void;
}

export const AppEditorForm: React.FC<AppEditorFormProps> = ({
  appName: initialAppName = "",
  status = "DRAFT",
  dragAndDropEnabled = false,
  documentTypes: initialDocumentTypes = [],
  onNameChange,
  onDragAndDropToggle,
  onAddDocumentType,
  onRemoveDocumentType,
  onConfirm,
}) => {
  const [appName, setAppName] = useState(initialAppName);
  const [documentTypes, setDocumentTypes] =
    useState<DocumentTypeItem[]>(initialDocumentTypes);
  const [selectedDocumentType, setSelectedDocumentType] = useState("");
  const [isConfirmed, setIsConfirmed] = useState(false);

  // Get available document types from the hook (combines reactor and vetra drive)
  const availableDocumentTypes = useAvailableDocumentTypes();

  // Use the debounce hook for name changes
  useDebounce(appName, onNameChange, 300);

  // Update local state when initial values change
  useEffect(() => {
    setAppName(initialAppName);
  }, [initialAppName]);

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
    if (appName.trim()) {
      setIsConfirmed(true); // Immediate UI update
      onConfirm?.();
    }
  };

  const handleRemoveDocumentType = (id: string) => {
    setDocumentTypes(documentTypes.filter((dt) => dt.id !== id));
    onRemoveDocumentType?.(id);
  };

  const handleAddDocumentType = (selectedValue: string) => {
    if (
      selectedValue &&
      !documentTypes.some((dt) => dt.documentType === selectedValue)
    ) {
      if (selectedValue === "all-documents") {
        // Special case for "All documents" - clear all individual types and add "*"
        const newType: DocumentTypeItem = {
          id: "all-documents",
          documentType: "*",
        };
        // Remove all existing document types first
        documentTypes.forEach((dt) => onRemoveDocumentType?.(dt.id));
        setDocumentTypes([newType]);
        onAddDocumentType?.("all-documents", "*");
      } else {
        // Regular document type - only add if "*" is not already selected
        if (!documentTypes.some((dt) => dt.documentType === "*")) {
          const id = Date.now().toString();
          const newType: DocumentTypeItem = {
            id,
            documentType: selectedValue,
          };
          setDocumentTypes([...documentTypes, newType]);
          onAddDocumentType?.(id, selectedValue);
        }
      }
    }
    setSelectedDocumentType("");
  };

  return (
    <div className="space-y-6 bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">App Configuration</h2>
        <StatusPill
          status={status === "CONFIRMED" ? "confirmed" : "draft"}
          label={status === "CONFIRMED" ? "Confirmed" : "Draft"}
        />
      </div>

      {/* App Name Field */}
      <div>
        <label
          htmlFor="app-name"
          className="mb-2 block text-sm font-medium text-gray-700"
        >
          App Name
        </label>
        <input
          id="app-name"
          type="text"
          value={appName}
          onChange={(e) => setAppName(e.target.value)}
          disabled={isReadOnly}
          className={`w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            isReadOnly ? "cursor-not-allowed bg-gray-100" : ""
          }`}
          placeholder="Enter app name"
        />
      </div>

      {/* Document Types Field */}
      <div>
        <label
          htmlFor="document-types"
          className="mb-2 block text-sm font-medium text-gray-700"
        >
          Document Types
        </label>
        <div className="space-y-2">
          {!isReadOnly &&
            !documentTypes.some((dt) => dt.documentType === "*") && (
              <select
                id="document-types"
                value={selectedDocumentType}
                onChange={(e) => handleAddDocumentType(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a document type to add</option>
                <option value="all-documents">All documents</option>
                {availableDocumentTypes
                  .filter(
                    (docType) =>
                      !documentTypes.some((dt) => dt.documentType === docType),
                  )
                  .map((docType) => (
                    <option key={docType} value={docType}>
                      {docType}
                    </option>
                  ))}
              </select>
            )}
          <div className="space-y-1">
            {documentTypes.map((type) => (
              <div key={type.id} className="flex items-center py-1">
                <span className="text-sm text-gray-700">
                  {type.documentType === "*"
                    ? "All documents (*)"
                    : type.documentType}
                </span>
                {!isReadOnly && (
                  <button
                    onClick={() => handleRemoveDocumentType(type.id)}
                    className="ml-2 text-gray-400 hover:text-gray-600 focus:outline-none"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          {documentTypes.some((dt) => dt.documentType === "*") && (
            <p className="text-sm italic text-gray-500">
              Wildcard (*) matches all document types
            </p>
          )}
        </div>
      </div>

      {/* Drag and Drop Settings */}
      <div>
        <h3 className="text-md mb-4 font-medium text-gray-900">
          Drag and Drop Settings
        </h3>

        {/* Enable/Disable Switch */}
        <div className="mb-4">
          <label htmlFor="drag-and-drop-enabled" className="flex items-center">
            <input
              id="drag-and-drop-enabled"
              type="checkbox"
              checked={dragAndDropEnabled}
              onChange={(e) => onDragAndDropToggle?.(e.target.checked)}
              disabled={isReadOnly}
              className={`mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${
                isReadOnly ? "cursor-not-allowed" : ""
              }`}
            />
            <span className="text-sm font-medium text-gray-700">
              Enable drag and drop
            </span>
          </label>
        </div>
      </div>

      {/* Confirm Button - only show if not in read-only mode */}
      {!isReadOnly && (
        <div>
          <button
            onClick={handleConfirm}
            disabled={!appName.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
};

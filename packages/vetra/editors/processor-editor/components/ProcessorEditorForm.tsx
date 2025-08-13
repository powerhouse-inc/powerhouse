import { useState, useEffect } from "react";
import type {
  DocumentTypeItem,
  AddDocumentTypeInput,
} from "../../../document-models/processor-module/index.js";

export interface ProcessorEditorFormProps {
  processorName?: string;
  processorType?: string;
  documentTypes?: DocumentTypeItem[];
  onConfirm?: (
    name: string,
    type: string,
    documentTypes: DocumentTypeItem[],
  ) => void;
}

export const ProcessorEditorForm: React.FC<ProcessorEditorFormProps> = ({
  processorName: initialProcessorName = "",
  processorType: initialProcessorType = "",
  documentTypes: initialDocumentTypes = [],
  onConfirm,
}) => {
  const [processorName, setProcessorName] = useState(initialProcessorName);
  const [processorType, setProcessorType] = useState(initialProcessorType);
  const [documentTypes, setDocumentTypes] =
    useState<DocumentTypeItem[]>(initialDocumentTypes);
  const [documentTypeInput, setDocumentTypeInput] = useState("");

  // Check if the form should be in read-only mode
  const isReadOnly =
    initialProcessorName !== "" &&
    initialProcessorType !== "" &&
    initialDocumentTypes.length > 0;

  // Update local state when initial values change
  useEffect(() => {
    setProcessorName(initialProcessorName);
  }, [initialProcessorName]);

  useEffect(() => {
    setProcessorType(initialProcessorType);
  }, [initialProcessorType]);

  useEffect(() => {
    setDocumentTypes(initialDocumentTypes);
  }, [initialDocumentTypes]);

  const handleConfirm = () => {
    if (processorName.trim() && processorType && documentTypes.length > 0) {
      onConfirm?.(processorName.trim(), processorType, documentTypes);
    }
  };

  const handleAddDocumentType = () => {
    if (documentTypeInput.trim()) {
      const newTypeInput: AddDocumentTypeInput = {
        id: Date.now().toString(),
        documentType: documentTypeInput.trim(),
      };
      if (
        !documentTypes.some(
          (dt) => dt.documentType === newTypeInput.documentType,
        )
      ) {
        const newType: DocumentTypeItem = {
          id: newTypeInput.id,
          documentType: newTypeInput.documentType,
        };
        setDocumentTypes([...documentTypes, newType]);
      }
      setDocumentTypeInput("");
    }
  };

  const handleRemoveDocumentType = (id: string) => {
    setDocumentTypes(documentTypes.filter((dt) => dt.id !== id));
  };

  const canConfirm =
    processorName.trim() && processorType && documentTypes.length > 0;

  return (
    <div className="space-y-6 bg-white p-6">
      <h2 className="text-lg font-medium text-gray-900">
        Processor Configuration
      </h2>

      {/* Processor Name Field */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Processor Name
        </label>
        <input
          type="text"
          value={processorName}
          onChange={(e) => setProcessorName(e.target.value)}
          disabled={isReadOnly}
          className={`w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            isReadOnly ? "cursor-not-allowed bg-gray-100" : ""
          }`}
          placeholder="Enter processor name"
        />
      </div>

      {/* Processor Type Dropdown */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Type
        </label>
        <select
          value={processorType}
          onChange={(e) => setProcessorType(e.target.value)}
          disabled={isReadOnly}
          className={`w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            isReadOnly ? "cursor-not-allowed bg-gray-100" : ""
          }`}
        >
          <option value="">Select type...</option>
          <option value="analytics">Analytics</option>
          <option value="relational">Relational Database</option>
        </select>
      </div>

      {/* Document Types Field */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Document Types
        </label>
        <div className="space-y-2">
          {!isReadOnly && (
            <input
              type="text"
              value={documentTypeInput}
              onChange={(e) => setDocumentTypeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddDocumentType();
                }
              }}
              placeholder="Type a document type and press Enter"
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
          <div className="space-y-1">
            {documentTypes.map((type) => (
              <div key={type.id} className="flex items-center py-1">
                <span className="text-sm text-gray-700">
                  {type.documentType}
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
        </div>
      </div>

      {/* Confirm Button - only show if not in read-only mode */}
      {!isReadOnly && (
        <div>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
};

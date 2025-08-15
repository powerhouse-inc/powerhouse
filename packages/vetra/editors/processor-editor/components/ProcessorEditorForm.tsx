import { useState, useEffect } from "react";
import type {
  DocumentTypeItem,
  AddDocumentTypeInput,
} from "../../../document-models/processor-module/index.js";
import { useDebounce } from "../../hooks/index.js";
import { StatusPill } from "../../components/index.js";

export interface ProcessorEditorFormProps {
  processorName?: string;
  processorType?: string;
  documentTypes?: DocumentTypeItem[];
  status?: string;
  onNameChange?: (name: string) => void;
  onTypeChange?: (type: string) => void;
  onAddDocumentType?: (id: string, documentType: string) => void;
  onRemoveDocumentType?: (id: string) => void;
  onConfirm?: () => void;
}

export const ProcessorEditorForm: React.FC<ProcessorEditorFormProps> = ({
  processorName: initialProcessorName = "",
  processorType: initialProcessorType = "",
  documentTypes: initialDocumentTypes = [],
  status = "DRAFT",
  onNameChange,
  onTypeChange,
  onAddDocumentType,
  onRemoveDocumentType,
  onConfirm,
}) => {
  const [processorName, setProcessorName] = useState(initialProcessorName);
  const [processorType, setProcessorType] = useState(initialProcessorType);
  const [documentTypes, setDocumentTypes] =
    useState<DocumentTypeItem[]>(initialDocumentTypes);
  const [documentTypeInput, setDocumentTypeInput] = useState("");
  const [isConfirmed, setIsConfirmed] = useState(false);

  // Use the debounce hook for name and type changes
  useDebounce(processorName, onNameChange, 300);
  useDebounce(processorType, onTypeChange, 300);

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

  // Reset confirmation state if status changes back to DRAFT
  useEffect(() => {
    if (status === "DRAFT") {
      setIsConfirmed(false);
    }
  }, [status]);

  // Check if form should be read-only
  const isReadOnly = isConfirmed || status === "CONFIRMED";

  const handleConfirm = () => {
    if (processorName.trim() && processorType && documentTypes.length > 0) {
      setIsConfirmed(true); // Immediate UI update
      onConfirm?.();
    }
  };

  const handleAddDocumentType = () => {
    if (documentTypeInput.trim()) {
      const id = Date.now().toString();
      const documentType = documentTypeInput.trim();
      
      if (
        !documentTypes.some(
          (dt) => dt.documentType === documentType,
        )
      ) {
        const newType: DocumentTypeItem = {
          id,
          documentType,
        };
        setDocumentTypes([...documentTypes, newType]);
        onAddDocumentType?.(id, documentType);
      }
      setDocumentTypeInput("");
    }
  };

  const handleRemoveDocumentType = (id: string) => {
    setDocumentTypes(documentTypes.filter((dt) => dt.id !== id));
    onRemoveDocumentType?.(id);
  };

  const canConfirm =
    processorName.trim() && processorType && documentTypes.length > 0;

  return (
    <div className="space-y-6 bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">
          Processor Configuration
        </h2>
        <StatusPill 
          status={status === "CONFIRMED" ? 'confirmed' : 'draft'} 
          label={status === "CONFIRMED" ? 'Confirmed' : 'Draft'} 
        />
      </div>

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

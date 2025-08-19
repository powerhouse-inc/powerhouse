import { useReactor } from "@powerhousedao/reactor-browser";
import { type DocumentModelDocument } from "document-model";
import { useEffect, useState } from "react";
import type { AddDocumentTypeInput, DocumentTypeItem, RemoveDocumentTypeInput } from "../../../document-models/document-editor/index.js";
import { StatusPill } from "../../components/index.js";
import { useDebounce } from "../../hooks/index.js";

export interface DocumentEditorFormProps {
  editorName?: string;
  documentTypes?: DocumentTypeItem[];
  status?: string;
  onEditorNameChange?: (name: string) => void;
  onAddDocumentType?: (input: AddDocumentTypeInput) => void;
  onRemoveDocumentType?: (input: RemoveDocumentTypeInput) => void;
  onConfirm?: () => void;
}

export const DocumentEditorForm: React.FC<DocumentEditorFormProps> = ({
  editorName: initialEditorName = "",
  documentTypes: initialDocumentTypes = [],
  status = "DRAFT",
  onEditorNameChange,
  onAddDocumentType,
  onRemoveDocumentType,
  onConfirm
}) => {
  const [editorName, setEditorName] = useState(initialEditorName);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeItem[]>(initialDocumentTypes);
  const [selectedDocumentType, setSelectedDocumentType] = useState("");
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [availableDocumentTypes, setAvailableDocumentTypes] = useState<string[]>([]);

  // Get available document types from reactor
  const reactor = useReactor();

  useEffect(() => {
    async function loadData() {
      const driveDocs = await reactor?.getDocuments("vetra");
      if (!driveDocs) {
        return;
      }

      const docTypes = (await Promise.all(driveDocs.map(async (docId) => {
        const document = await reactor?.getDocument(docId);
        if (document?.header.documentType === "powerhouse/document-model") {
          const documentModel = document as DocumentModelDocument;
          return documentModel.state.global.id;
        }
        return null;
      }))).filter(e => e !== null);
      setAvailableDocumentTypes(docTypes);
    }
    loadData();
  }, [reactor]);

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
    <div className="space-y-6 p-6 bg-white">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">Editor Configuration</h2>
        <StatusPill 
          status={status === "CONFIRMED" ? 'confirmed' : 'draft'} 
          label={status === "CONFIRMED" ? 'Confirmed' : 'Draft'} 
        />
      </div>
      
      {/* Editor Name Field */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Editor Name
        </label>
        <input
          type="text"
          value={editorName}
          onChange={(e) => setEditorName(e.target.value)}
          disabled={isReadOnly}
          className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            isReadOnly ? 'bg-gray-100 cursor-not-allowed' : ''
          }`}
        />
      </div>

      {/* Supported Document Types Field */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Supported Document Types
        </label>
        <div className="space-y-2">
          {!isReadOnly && availableDocumentTypes.length > 0 && (
            <select
              value={selectedDocumentType}
              onChange={(e) => {
                const selectedValue = e.target.value;
                if (selectedValue && !documentTypes.some(dt => dt.documentType === selectedValue)) {
                  const newTypeInput: AddDocumentTypeInput = {
                    id: Date.now().toString(), // Generate a unique ID
                    documentType: selectedValue
                  };
                  const newType: DocumentTypeItem = {
                    id: newTypeInput.id,
                    documentType: newTypeInput.documentType
                  };
                  setDocumentTypes([...documentTypes, newType]);
                  onAddDocumentType?.(newTypeInput);
                }
                setSelectedDocumentType('');
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select a document type to add</option>
              {availableDocumentTypes
                .filter(docType => !documentTypes.some(dt => dt.documentType === docType))
                .map((docType) => (
                  <option key={docType} value={docType}>
                    {docType}
                  </option>
                ))
              }
            </select>
          )}
          <div className="space-y-1">
            {documentTypes.map((type) => (
              <div 
                key={type.id}
                className="flex items-center py-1"
              >
                <span className="text-sm text-gray-700">{type.documentType}</span>
                {!isReadOnly && (
                  <button
                    onClick={() => {
                      setDocumentTypes(documentTypes.filter((dt) => dt.id !== type.id));
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
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
};
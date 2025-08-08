import { useState } from "react";
import { useDebounce } from "../../hooks/index.js";
import type { DocumentTypeItem, AddDocumentTypeInput, RemoveDocumentTypeInput } from "../../../document-models/document-editor/index.js";

export interface DocumentEditorFormProps {
  editorName?: string;
  editorId?: string;
  documentTypes?: DocumentTypeItem[];
  onEditorNameChange?: (name: string) => void;
  onEditorIdChange?: (id: string) => void;
  onAddDocumentType?: (input: AddDocumentTypeInput) => void;
  onRemoveDocumentType?: (input: RemoveDocumentTypeInput) => void;
}

export const DocumentEditorForm: React.FC<DocumentEditorFormProps> = ({
  editorName: initialEditorName = "",
  editorId: initialEditorId = "",
  documentTypes: initialDocumentTypes = [],
  onEditorNameChange,
  onEditorIdChange,
  onAddDocumentType,
  onRemoveDocumentType
}) => {
  const [editorName, setEditorName] = useState(initialEditorName);
  const [editorId, setEditorId] = useState(initialEditorId);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeItem[]>(initialDocumentTypes);
  const [documentTypeInput, setDocumentTypeInput] = useState("");

  // Use the debounce hook with callbacks
  useDebounce(editorName, onEditorNameChange, 300);
  useDebounce(editorId, onEditorIdChange, 300);

  return (
    <div className="space-y-6 p-6 bg-white">
      <h2 className="text-lg font-medium text-gray-900">Atlas Exploratory</h2>
      
      {/* Editor Name Field */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Editor Name
        </label>
        <input
          type="text"
          value={editorName}
          onChange={(e) => setEditorName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Editor ID Field */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Editor ID
        </label>
        <input
          type="text"
          value={editorId}
          onChange={(e) => setEditorId(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <p className="mt-1 text-xs text-gray-500">
          This ID will be used to reference the document throughout your code
        </p>
      </div>

      {/* Supported Document Types Field */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Supported Document Types
        </label>
        <div className="space-y-2">
          <input
            type="text"
            value={documentTypeInput}
            onChange={(e) => setDocumentTypeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && documentTypeInput.trim()) {
                e.preventDefault();
                const newTypeInput: AddDocumentTypeInput = {
                  id: Date.now().toString(), // Generate a unique ID
                  documentType: documentTypeInput.trim()
                };
                if (!documentTypes.some(dt => dt.documentType === newTypeInput.documentType)) {
                  const newType: DocumentTypeItem = {
                    id: newTypeInput.id,
                    documentType: newTypeInput.documentType
                  };
                  setDocumentTypes([...documentTypes, newType]);
                  onAddDocumentType?.(newTypeInput);
                }
                setDocumentTypeInput('');
              }
            }}
            placeholder="Type a document type and press Enter"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <div className="space-y-1">
            {documentTypes.map((type) => (
              <div 
                key={type.id}
                className="flex items-center py-1"
              >
                <span className="text-sm text-gray-700">{type.documentType}</span>
                <button
                  onClick={() => {
                    setDocumentTypes(documentTypes.filter((dt) => dt.id !== type.id));
                    onRemoveDocumentType?.({ id: type.id });
                  }}
                  className="ml-2 text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
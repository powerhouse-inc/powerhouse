import {
  useDocumentTypesInSelectedDrive,
  useSupportedDocumentTypesInReactor,
} from "@powerhousedao/reactor-browser";
import { useEffect, useState } from "react";
import { actions } from "../../../document-models/app-module/index.js";
import { StatusPill } from "../../components/index.js";
import { useDebounce } from "../../hooks/index.js";
import { useSelectedAppModuleDocument } from "../../hooks/useVetraDocument.js";

const ALL_IN_DRIVE = "all-in-drive";
const ALL_IN_REACTOR = "all-in-reactor";
const ALLOW_ANY = "allow-any";

export const AppEditorForm = () => {
  const [document, dispatch] = useSelectedAppModuleDocument();
  const documentName = document.state.global.name;
  const status = document.state.global.status;
  const isDragAndDropEnabled = document.state.global.isDragAndDropEnabled;
  const allowedDocumentTypes = document.state.global.allowedDocumentTypes;
  const [appName, setAppName] = useState(documentName);
  const [isConfirmed, setIsConfirmed] = useState(status === "CONFIRMED");
  const documentTypesInSelectedDrive = useDocumentTypesInSelectedDrive();
  const supportedDocumentTypesInReactor = useSupportedDocumentTypesInReactor();
  const [selectedDocumentTypes, setSelectedDocumentTypes] = useState(
    allowedDocumentTypes ?? [],
  );

  // Use the debounce hook for name changes

  const onNameChange = (name: string) => {
    if (name === documentName) return;
    dispatch(actions.setAppName({ name }));
  };

  useDebounce(appName, onNameChange, 300);

  const onConfirm = () => {
    dispatch(actions.setAppStatus({ status: "CONFIRMED" }));
  };

  const onDragAndDropToggle = (enabled: boolean) => {
    if (enabled === isDragAndDropEnabled) return;
    dispatch(actions.setDragAndDropEnabled({ enabled }));
  };

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
      onConfirm();
    }
  };

  const handleAddDocumentType = (documentType: string) => {
    if (!documentType || selectedDocumentTypes.includes(documentType)) return;
    setSelectedDocumentTypes([...selectedDocumentTypes, documentType]);
    dispatch(actions.addDocumentType({ documentType }));
  };

  const handleRemoveDocumentType = (documentType: string) => {
    setSelectedDocumentTypes(
      selectedDocumentTypes.filter((dt) => dt !== documentType),
    );
    dispatch(actions.removeDocumentType({ documentType }));
  };

  const handleAddAllDocumentTypesInDrive = () => {
    const newDocumentTypes = [
      ...new Set([
        ...selectedDocumentTypes,
        ...(documentTypesInSelectedDrive ?? []),
      ]),
    ];
    setSelectedDocumentTypes(newDocumentTypes);
    dispatch(actions.setDocumentTypes({ documentTypes: newDocumentTypes }));
  };

  const handleAddAllDocumentTypesInReactor = () => {
    const newDocumentTypes = [
      ...new Set([
        ...selectedDocumentTypes,
        ...(supportedDocumentTypesInReactor ?? []),
      ]),
    ];
    setSelectedDocumentTypes(newDocumentTypes);
    dispatch(actions.setDocumentTypes({ documentTypes: newDocumentTypes }));
  };

  const handleAllowAnyDocumentType = () => {
    setSelectedDocumentTypes([]);
    dispatch(actions.setDocumentTypes({ documentTypes: [] }));
  };

  const handleDocumentTypeSelection = (selectedValue: string) => {
    if (selectedValue === ALL_IN_DRIVE) {
      handleAddAllDocumentTypesInDrive();
    } else if (selectedValue === ALL_IN_REACTOR) {
      handleAddAllDocumentTypesInReactor();
    } else if (selectedValue === ALLOW_ANY) {
      handleAllowAnyDocumentType();
    } else {
      handleAddDocumentType(selectedValue);
    }
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
        <label className="mb-2 block text-sm font-medium text-gray-700">
          App Name
        </label>
        <input
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
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Document Types
        </label>
        <div className="space-y-2">
          {!isReadOnly && (
            <select
              onChange={(e) => handleDocumentTypeSelection(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option>Select a document type to add</option>
              <option>--- Vetra drive document types ---</option>
              <option value={ALL_IN_DRIVE}>
                Add all document types in Vetra drive
              </option>
              {documentTypesInSelectedDrive
                ?.filter((dt) => !selectedDocumentTypes.includes(dt))
                .map((docType) => (
                  <option key={docType} value={docType}>
                    {docType}
                  </option>
                ))}
              <option>--- Reactor document types ---</option>
              <option value={ALL_IN_REACTOR}>
                Add all document types in Reactor
              </option>
              {supportedDocumentTypesInReactor
                ?.filter((dt) => !selectedDocumentTypes.includes(dt))
                .map((docType) => (
                  <option key={docType} value={docType}>
                    {docType}
                  </option>
                ))}
              <option>--- Allow any document type ---</option>
              <option value={ALLOW_ANY}>Allow any document type</option>
            </select>
          )}
          <div className="space-y-1">
            {selectedDocumentTypes.length > 0 ? (
              selectedDocumentTypes.map((type) => (
                <div key={type} className="flex items-center py-1">
                  <span className="text-sm text-gray-700">{type}</span>
                  {!isReadOnly && (
                    <button
                      onClick={() => handleRemoveDocumentType(type)}
                      className="ml-2 text-gray-400 hover:text-gray-600 focus:outline-none"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))
            ) : (
              <span className="text-sm text-gray-700">All documents (*)</span>
            )}
          </div>
        </div>
      </div>

      {/* Drag and Drop Settings */}
      <div>
        <h3 className="text-md mb-4 font-medium text-gray-900">
          Drag and Drop Settings
        </h3>

        {/* Enable/Disable Switch */}
        <div className="mb-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={isDragAndDropEnabled}
              onChange={(e) => onDragAndDropToggle(e.target.checked)}
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

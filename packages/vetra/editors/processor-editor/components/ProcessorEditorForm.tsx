import {
  PROCESSOR_APPS,
  type ProcessorApp,
  type ProcessorApps,
} from "@powerhousedao/shared/processors";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";
import type { DocumentTypeItem } from "../../../document-models/processor-module/index.js";
import { StatusPill } from "../../components/index.js";
import { useAvailableDocumentTypes, useDebounce } from "../../hooks/index.js";

export interface ProcessorEditorFormProps {
  processorName?: string;
  processorType?: string;
  documentTypes?: DocumentTypeItem[];
  processorApps?: ProcessorApps;
  status?: string;
  onNameChange?: (name: string) => void;
  onTypeChange?: (type: string) => void;
  onAddDocumentType?: (id: string, documentType: string) => void;
  onRemoveDocumentType?: (id: string) => void;
  onAddProcessorApp?: (processorApp: ProcessorApp) => void;
  onRemoveProcessorApp?: (processorApp: ProcessorApp) => void;
  onConfirm?: () => void;
}

export const ProcessorEditorForm: React.FC<ProcessorEditorFormProps> = ({
  processorName: initialProcessorName = "",
  processorType: initialProcessorType = "",
  documentTypes: initialDocumentTypes = [],
  processorApps: initialProcessorApps = [],
  status = "DRAFT",
  onNameChange,
  onTypeChange,
  onAddDocumentType,
  onRemoveDocumentType,
  onAddProcessorApp,
  onRemoveProcessorApp,
  onConfirm,
}) => {
  const [processorName, setProcessorName] = useState(initialProcessorName);
  const [processorType, setProcessorType] = useState(initialProcessorType);
  const [documentTypes, setDocumentTypes] =
    useState<DocumentTypeItem[]>(initialDocumentTypes);
  const [selectedDocumentType, setSelectedDocumentType] = useState("");
  const [processorApps, setProcessorApps] = useState(initialProcessorApps);
  const [isConfirmed, setIsConfirmed] = useState(false);

  // Get available document types from the hook (combines reactor and vetra drive)
  const availableDocumentTypes = useAvailableDocumentTypes();

  // Use the debounce hook for name and type changes
  useDebounce(processorName, onNameChange, 300);
  useDebounce(processorType, onTypeChange, 300);

  // Update local state when initial values change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProcessorName(initialProcessorName);
  }, [initialProcessorName]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProcessorType(initialProcessorType);
  }, [initialProcessorType]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDocumentTypes(initialDocumentTypes);
  }, [initialDocumentTypes]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProcessorApps(initialProcessorApps);
  }, [initialProcessorApps]);

  // Reset confirmation state if status changes back to DRAFT
  useEffect(() => {
    if (status === "DRAFT") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsConfirmed(false);
    }
  }, [status]);

  // Check if form should be read-only
  const isReadOnly = isConfirmed || status === "CONFIRMED";

  const handleConfirm = () => {
    if (
      processorName.trim() &&
      processorType &&
      documentTypes.length > 0 &&
      processorApps.length > 0
    ) {
      setIsConfirmed(true); // Immediate UI update
      onConfirm?.();
    }
  };

  const handleRemoveDocumentType = (id: string) => {
    setDocumentTypes(documentTypes.filter((dt) => dt.id !== id));
    onRemoveDocumentType?.(id);
  };

  const canConfirm =
    !!processorName.trim() &&
    !!processorType &&
    documentTypes.length > 0 &&
    processorApps.length > 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900 dark:text-slate-50">
          Processor Configuration
        </h2>
        <StatusPill
          status={status === "CONFIRMED" ? "confirmed" : "draft"}
          label={status === "CONFIRMED" ? "Confirmed" : "Draft"}
        />
      </div>

      {/* Processor Name Field */}
      <div>
        <label
          htmlFor="processor-name"
          className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-200"
        >
          Processor Name
        </label>
        <input
          id="processor-name"
          type="text"
          value={processorName}
          onChange={(e) => setProcessorName(e.target.value)}
          disabled={isReadOnly}
          className={twMerge(
            "w-full rounded-md border border-gray-300 px-3 py-2 placeholder:text-gray-700 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100 dark:placeholder:text-slate-200",
            isReadOnly
              ? "cursor-not-allowed bg-gray-100 dark:bg-slate-700"
              : "",
          )}
          placeholder="Enter processor name"
        />
      </div>

      {/* Processor Type Dropdown */}
      <div>
        <label
          htmlFor="processor-type"
          className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-200"
        >
          Type
        </label>
        <select
          id="processor-type"
          value={processorType}
          onChange={(e) => setProcessorType(e.target.value)}
          disabled={isReadOnly}
          className={twMerge(
            "w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100",
            isReadOnly
              ? "cursor-not-allowed bg-gray-100 dark:bg-slate-700"
              : "",
          )}
        >
          <option value="">Select type...</option>
          <option value="analytics">Analytics</option>
          <option value="relational">Relational Database</option>
        </select>
      </div>

      {/* Document Types Field */}
      <div>
        <label
          htmlFor="document-types"
          className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-200"
        >
          Document Types
        </label>
        <div className="space-y-2">
          {!isReadOnly && availableDocumentTypes.length > 0 && (
            <select
              id="document-types"
              value={selectedDocumentType}
              onChange={(e) => {
                const selectedValue = e.target.value;
                if (
                  selectedValue &&
                  !documentTypes.some((dt) => dt.documentType === selectedValue)
                ) {
                  const id = Date.now().toString();
                  const newType: DocumentTypeItem = {
                    id,
                    documentType: selectedValue,
                  };
                  setDocumentTypes([...documentTypes, newType]);
                  onAddDocumentType?.(id, selectedValue);
                }
                setSelectedDocumentType("");
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100"
            >
              <option value="">Select a document type to add</option>
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
                <span className="text-sm text-gray-700 dark:text-slate-200">
                  {type.documentType}
                </span>
                {!isReadOnly && (
                  <button
                    onClick={() => handleRemoveDocumentType(type.id)}
                    className="ml-2 text-gray-400 hover:effect focus:outline-none dark:text-slate-500"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Processor Apps Field */}
      <div>
        <label
          htmlFor="processor-apps"
          className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-200"
        >
          Processor Apps
        </label>
        <div className="space-y-2">
          {!isReadOnly && (
            <>
              {PROCESSOR_APPS.map((processorApp) => (
                <div key={processorApp} className="flex gap-1">
                  <input
                    type="checkbox"
                    name={processorApp}
                    id={processorApp}
                    checked={processorApps.includes(processorApp)}
                    onChange={(event) => {
                      const isChecked = event.target.checked;
                      if (isChecked) {
                        setProcessorApps((processorApps) => [
                          ...new Set([...processorApps, processorApp]),
                        ]);
                        onAddProcessorApp?.(processorApp);
                      } else {
                        if (processorApps.length > 1) {
                          setProcessorApps((processorApps) =>
                            processorApps.filter((p) => p !== processorApp),
                          );
                          onRemoveProcessorApp?.(processorApp);
                        }
                      }
                    }}
                  />
                  <label
                    htmlFor={processorApp}
                    className="text-gray-700 dark:text-slate-200"
                  >
                    {processorApp}
                  </label>
                </div>
              ))}
            </>
          )}
          <div className="space-y-1">
            {isReadOnly &&
              processorApps.map((processorApp) => (
                <span
                  key={processorApp}
                  className="text-sm text-gray-700 dark:text-slate-200"
                >
                  {processorApp}
                </span>
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
            className="rounded-md bg-blue-500 px-4 py-2 text-white hover:effect focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-300 dark:bg-blue-100 dark:text-slate-900 dark:disabled:bg-slate-600 dark:disabled:text-slate-100"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
};

import { useState, useEffect } from "react";
import { useDebounce } from "../../hooks/index.js";
import { StatusPill } from "../../components/index.js";

export interface AppEditorFormProps {
  appName?: string;
  status?: string;
  onNameChange?: (name: string) => void;
  onConfirm?: () => void;
}

export const AppEditorForm: React.FC<AppEditorFormProps> = ({
  appName: initialAppName = "",
  status = "DRAFT",
  onNameChange,
  onConfirm
}) => {
  const [appName, setAppName] = useState(initialAppName);
  const [isConfirmed, setIsConfirmed] = useState(false);

  // Use the debounce hook for name changes
  useDebounce(appName, onNameChange, 300);

  // Update local state when initialAppName changes
  useEffect(() => {
    setAppName(initialAppName);
  }, [initialAppName]);

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

  return (
    <div className="space-y-6 p-6 bg-white">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">App Configuration</h2>
        <StatusPill 
          status={status === "CONFIRMED" ? 'confirmed' : 'draft'} 
          label={status === "CONFIRMED" ? 'Confirmed' : 'Draft'} 
        />
      </div>
      
      {/* App Name Field */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          App Name
        </label>
        <input
          type="text"
          value={appName}
          onChange={(e) => setAppName(e.target.value)}
          disabled={isReadOnly}
          className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            isReadOnly ? 'bg-gray-100 cursor-not-allowed' : ''
          }`}
          placeholder="Enter app name"
        />
      </div>

      {/* Confirm Button - only show if not in read-only mode */}
      {!isReadOnly && (
        <div>
          <button
            onClick={handleConfirm}
            disabled={!appName.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
};
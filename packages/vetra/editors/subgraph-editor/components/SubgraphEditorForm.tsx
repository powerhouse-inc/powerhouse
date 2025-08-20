import { useState, useEffect } from "react";
import { useDebounce } from "../../hooks/index.js";
import { StatusPill } from "../../components/index.js";

export interface SubgraphEditorFormProps {
  subgraphName?: string;
  status?: string;
  onNameChange?: (name: string) => void;
  onConfirm?: () => void;
}

export const SubgraphEditorForm: React.FC<SubgraphEditorFormProps> = ({
  subgraphName: initialSubgraphName = "",
  status = "DRAFT",
  onNameChange,
  onConfirm,
}) => {
  const [subgraphName, setSubgraphName] = useState(initialSubgraphName);
  const [isConfirmed, setIsConfirmed] = useState(false);

  // Use the debounce hook for name changes
  useDebounce(subgraphName, onNameChange, 300);

  // Update local state when initialSubgraphName changes
  useEffect(() => {
    setSubgraphName(initialSubgraphName);
  }, [initialSubgraphName]);

  // Reset confirmation state if status changes back to DRAFT
  useEffect(() => {
    if (status === "DRAFT") {
      setIsConfirmed(false);
    }
  }, [status]);

  // Check if form should be read-only
  const isReadOnly = isConfirmed || status === "CONFIRMED";

  const handleConfirm = () => {
    if (subgraphName.trim()) {
      setIsConfirmed(true); // Immediate UI update
      onConfirm?.();
    }
  };

  return (
    <div className="space-y-6 bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">
          Subgraph Configuration
        </h2>
        <StatusPill
          status={status === "CONFIRMED" ? "confirmed" : "draft"}
          label={status === "CONFIRMED" ? "Confirmed" : "Draft"}
        />
      </div>

      {/* Subgraph Name Field */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Subgraph Name
        </label>
        <input
          type="text"
          value={subgraphName}
          onChange={(e) => setSubgraphName(e.target.value)}
          disabled={isReadOnly}
          className={`w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            isReadOnly ? "cursor-not-allowed bg-gray-100" : ""
          }`}
          placeholder="Enter subgraph name"
        />
      </div>

      {/* Confirm Button - only show if not in read-only mode */}
      {!isReadOnly && (
        <div>
          <button
            onClick={handleConfirm}
            disabled={!subgraphName.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
};

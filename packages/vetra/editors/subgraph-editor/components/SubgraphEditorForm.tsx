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
  onConfirm
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
    <div className="space-y-6 p-6 bg-white">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">Subgraph Configuration</h2>
        <StatusPill 
          status={status === "CONFIRMED" ? 'confirmed' : 'draft'} 
          label={status === "CONFIRMED" ? 'Confirmed' : 'Draft'} 
        />
      </div>
      
      {/* Subgraph Name Field */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Subgraph Name
        </label>
        <input
          type="text"
          value={subgraphName}
          onChange={(e) => setSubgraphName(e.target.value)}
          disabled={isReadOnly}
          className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            isReadOnly ? 'bg-gray-100 cursor-not-allowed' : ''
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
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
};
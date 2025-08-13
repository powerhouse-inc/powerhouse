import { useState, useEffect } from "react";

export interface SubgraphEditorFormProps {
  subgraphName?: string;
  onConfirm?: (name: string) => void;
}

export const SubgraphEditorForm: React.FC<SubgraphEditorFormProps> = ({
  subgraphName: initialSubgraphName = "",
  onConfirm
}) => {
  const [subgraphName, setSubgraphName] = useState(initialSubgraphName);
  
  // Check if the name is already set (read-only mode)
  const isReadOnly = initialSubgraphName !== "";

  // Update local state when initialSubgraphName changes
  useEffect(() => {
    setSubgraphName(initialSubgraphName);
  }, [initialSubgraphName]);

  const handleConfirm = () => {
    if (subgraphName.trim()) {
      onConfirm?.(subgraphName.trim());
    }
  };

  return (
    <div className="space-y-6 p-6 bg-white">
      <h2 className="text-lg font-medium text-gray-900">Subgraph Configuration</h2>
      
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
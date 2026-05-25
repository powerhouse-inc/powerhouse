import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";
import { StatusPill } from "../../components/index.js";
import { useDebounce } from "../../hooks/index.js";

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubgraphName(initialSubgraphName);
  }, [initialSubgraphName]);

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
    if (subgraphName.trim()) {
      setIsConfirmed(true); // Immediate UI update
      onConfirm?.();
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900 dark:text-slate-50">
          Subgraph Configuration
        </h2>
        <StatusPill
          status={status === "CONFIRMED" ? "confirmed" : "draft"}
          label={status === "CONFIRMED" ? "Confirmed" : "Draft"}
        />
      </div>

      {/* Subgraph Name Field */}
      <div>
        <label
          htmlFor="subgraph-name"
          className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-200"
        >
          Subgraph Name
        </label>
        <input
          id="subgraph-name"
          type="text"
          value={subgraphName}
          onChange={(e) => setSubgraphName(e.target.value)}
          disabled={isReadOnly}
          className={twMerge(
            "w-full rounded-md border border-gray-300 px-3 py-2 placeholder:text-gray-700 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-slate-500 dark:placeholder:text-slate-200",
            isReadOnly
              ? "cursor-not-allowed bg-gray-100 dark:bg-slate-700"
              : "",
          )}
          placeholder="Enter subgraph name"
        />
      </div>

      {/* Confirm Button - only show if not in read-only mode */}
      {!isReadOnly && (
        <div>
          <button
            onClick={handleConfirm}
            disabled={!subgraphName.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-300 dark:bg-blue-300 dark:text-slate-900 dark:hover:bg-blue-200 dark:disabled:bg-slate-600"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
};

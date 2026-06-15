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
        <h2 className="text-lg font-medium text-foreground">
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
          className="mb-2 block text-sm font-medium text-foreground"
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
            "w-full rounded-md border border-border px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-transparent focus:ring-2 focus:ring-ring focus:outline-none disabled:disabled-effect",
            isReadOnly ? "cursor-not-allowed bg-muted" : "",
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
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:hover-effect focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none disabled:disabled-effect"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
};

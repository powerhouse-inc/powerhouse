import { cn, type ViewMode } from "@powerhousedao/design-system/scalars";
import { type Change } from "diff";

interface DiffPartProps {
  changes: Change[];
  original: Change[];
  className?: string;
  viewMode: ViewMode;
}

const SplitDiff = ({
  changes,
  original,
  className,
  viewMode,
}: DiffPartProps) => {
  return (
    <span className={cn("flex flex-row items-center", className)}>
      <span
        className={cn(
          "flex flex-row",
          viewMode === "mixed" && "bg-red-600/30 text-gray-700",
          viewMode === "removal" && "bg-red-600/30 text-gray-700",
        )}
      >
        {original.map((original) => (
          <span key={original.value} className="mr-1">
            {original.value}
          </span>
        ))}
      </span>
      <span className="mx-1 h-9 w-px bg-gray-300" />
      <span
        className={cn(
          "flex flex-row",
          viewMode === "addition" && "bg-green-600/30 text-gray-700",
          viewMode === "mixed" && "bg-green-600/30 text-gray-700",
        )}
      >
        {changes.map((change) => (
          <span key={change.value} className="mr-1">
            {change.value}
          </span>
        ))}
      </span>
    </span>
  );
};

export default SplitDiff;

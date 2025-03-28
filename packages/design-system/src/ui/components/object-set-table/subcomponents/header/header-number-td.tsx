import { cn } from "#scalars";
import { useInternalTableState } from "../table-provider/table-provider.js";
import { HeaderCell } from "./header-cell.js";

interface HeaderNumberTdProps
  extends React.HTMLAttributes<HTMLTableCellElement> {
  isAllRowsSelected: boolean;
  handleSelectAllRows: () => void;
}

const HeaderNumberTd: React.FC<HeaderNumberTdProps> = ({
  className,
  isAllRowsSelected,
  handleSelectAllRows,
  ...props
}) => {
  const {
    config: { showRowNumbers, allowRowSelection },
  } = useInternalTableState();

  if (!showRowNumbers && !allowRowSelection) {
    return null;
  }

  return (
    <HeaderCell
      className={cn(
        "min-w-9 border-r border-gray-300 text-center",
        allowRowSelection && "cursor-pointer",
        isAllRowsSelected && "bg-blue-900 text-white",
        className,
      )}
      onClick={handleSelectAllRows}
      {...props}
    >
      {showRowNumbers ? "#" : ""}
    </HeaderCell>
  );
};

export { HeaderNumberTd };

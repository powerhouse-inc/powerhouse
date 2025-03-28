import { cn } from "#scalars";
import { useInternalTableState } from "../table-provider/table-provider.js";
import { TableCellBasic } from "./basic-cell.js";

interface RowNumberCellProps {
  index: number;
  handleSelectRowOnClick?: (
    event: React.MouseEvent<HTMLTableCellElement>,
  ) => void;
  selected: boolean;
}

const RowNumberCell: React.FC<RowNumberCellProps> = ({
  index,
  handleSelectRowOnClick,
  selected,
}) => {
  const {
    config: { showRowNumbers, allowRowSelection },
  } = useInternalTableState();

  if (!showRowNumbers && !allowRowSelection) {
    // if allow selection is enabled we need to show the row anyways
    // to allow the user to select the row
    return null;
  }

  return (
    <TableCellBasic
      className={cn(
        "min-w-9 select-none border-r border-gray-300 text-center",
        allowRowSelection && "cursor-pointer",
        selected && "bg-blue-900 text-white",
      )}
      onClick={handleSelectRowOnClick}
    >
      {showRowNumbers ? index : ""}
    </TableCellBasic>
  );
};

export { RowNumberCell };

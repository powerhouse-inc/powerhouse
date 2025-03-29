import { cn } from "#scalars";
import { useInternalTableState } from "../table-provider/table-provider.js";
import { TableCellBasic } from "./basic-cell.js";

const RowNumberCell: React.FC<{ index: number }> = ({ index }) => {
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
      className={cn("min-w-9 border-r border-gray-300 text-center")}
    >
      {showRowNumbers ? index : ""}
    </TableCellBasic>
  );
};

export { RowNumberCell };

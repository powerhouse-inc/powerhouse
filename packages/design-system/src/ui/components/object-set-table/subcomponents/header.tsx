import { cn } from "#scalars";
import type React from "react";
import { useCallback } from "react";
import type { ColumnDef } from "../types.js";
import { getColumnTitle } from "../utils.js";
import { HeaderCell } from "./header/header-cell.js";
import { HeaderNumberTd } from "./header/header-number-td.js";
import { useInternalTableState } from "./table-provider/table-provider.js";

interface TableHeaderProps {
  columns: ColumnDef[];
}

const TableHeader: React.FC<TableHeaderProps> = ({ columns }) => {
  const {
    config: { data },
    state: { selectedRowIndexes, dispatch },
  } = useInternalTableState();

  const handleSelectAllRows = useCallback(() => {
    // TODO: uncomment this once it is safe to implement it
    // dispatch?.({ type: "TOGGLE_SELECT_ALL_ROWS" });
  }, [dispatch]);

  const isAllRowsSelected = selectedRowIndexes.length === data.length;

  return (
    <thead>
      <tr
        className={cn(
          "border-gray-300",
          !selectedRowIndexes.includes(0) && "border-b",
        )}
      >
        <HeaderNumberTd
          isAllRowsSelected={isAllRowsSelected}
          handleSelectAllRows={handleSelectAllRows}
        />
        {columns.map((column) => (
          <HeaderCell key={column.field}>{getColumnTitle(column)}</HeaderCell>
        ))}
      </tr>
    </thead>
  );
};

export { TableHeader };

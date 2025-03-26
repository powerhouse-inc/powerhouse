import type React from "react";
import type { ColumnDef } from "../types.js";
import { getColumnTitle } from "../utils.js";
import { HeaderCell } from "./header/header-cell.js";
import { HeaderNumberTd } from "./header/header-number-td.js";

interface TableHeaderProps {
  columns: ColumnDef[];
}

const TableHeader: React.FC<TableHeaderProps> = ({ columns }) => {
  return (
    <thead>
      <tr className="border-b border-gray-300">
        <HeaderNumberTd />
        {columns.map((column) => (
          <HeaderCell key={column.field}>{getColumnTitle(column)}</HeaderCell>
        ))}
      </tr>
    </thead>
  );
};

export { TableHeader };

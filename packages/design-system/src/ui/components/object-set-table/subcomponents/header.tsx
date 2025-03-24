import type React from "react";
import { cn } from "../../../../scalars/lib/utils.js";
import type { ColumnDef } from "../types.js";
import { getColumnTitle } from "../utils.js";

interface TableHeaderProps {
  columns: ColumnDef[];
}

const HeaderCell: React.FC<React.HTMLAttributes<HTMLTableCellElement>> = ({
  children,
  className,
  ...props
}) => {
  return (
    <th
      className={cn(
        "px-[12px] py-[15px] text-left text-[14px] font-medium leading-[14px] text-gray-500",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
};

const TableHeader: React.FC<TableHeaderProps> = ({ columns }) => {
  return (
    <thead>
      <tr className="border-b border-gray-300">
        <HeaderCell className="border-r border-gray-300 text-center">
          #
        </HeaderCell>
        {columns.map((column) => (
          <HeaderCell key={column.field}>{getColumnTitle(column)}</HeaderCell>
        ))}
      </tr>
    </thead>
  );
};

export { TableHeader };

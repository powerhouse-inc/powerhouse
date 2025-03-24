import type React from "react";
import { cn } from "../../../../scalars/lib/utils.js";
import type { ColumnDef, DataType } from "../types.js";
import { getColumnValue } from "../utils.js";

interface TableBodyProps<T extends DataType> {
  data: T[];
  columns: ColumnDef[];
}

const TableRow: React.FC<
  React.HTMLAttributes<HTMLTableRowElement> & { selected: boolean }
> = ({ children, className, selected = false, ...props }) => {
  return (
    <tr
      className={cn(
        "not-last:border-b border-gray-100 hover:bg-gray-100",
        // selected && "border-b border-t border-blue-900 bg-blue-50",
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  );
};

const TableCellBasic: React.FC<React.HTMLAttributes<HTMLTableCellElement>> = ({
  children,
  className,
  ...props
}) => {
  return (
    <td className={cn("py-2", className)} {...props}>
      {children}
    </td>
  );
};

const TableCell: React.FC<React.HTMLAttributes<HTMLTableCellElement>> = ({
  children,
  ...props
}) => {
  return (
    <TableCellBasic {...props}>
      <div className="px-[12px] py-2">{children}</div>
    </TableCellBasic>
  );
};

const TableBody = <T extends DataType>({
  data,
  columns,
}: TableBodyProps<T>) => {
  return (
    <tbody className="text-sm leading-5 text-gray-900">
      {data.map((rowItem, index) => (
        <TableRow key={index} selected={index === 5}>
          <TableCell className="border-r border-gray-300 text-center">
            {index + 1}
          </TableCell>
          {columns.map((column) => (
            <TableCell key={column.field}>
              {getColumnValue(rowItem, column.field) as string}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </tbody>
  );
};

export { TableBody };

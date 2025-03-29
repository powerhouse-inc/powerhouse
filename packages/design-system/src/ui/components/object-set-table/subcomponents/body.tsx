import type { ColumnDef, DataType } from "../types.js";
import { getColumnValue } from "../utils.js";
import { DefaultTableCell } from "./cells/default-cell.js";
import { RowNumberCell } from "./cells/row-number-cell.js";
import { TableRow } from "./rows/table-row.js";

interface TableBodyProps<T extends DataType> {
  data: T[];
  columns: ColumnDef[];
}

const TableBody = <T extends DataType>({
  data,
  columns,
}: TableBodyProps<T>) => {
  return (
    <tbody className="text-sm leading-5 text-gray-900">
      {data.map((rowItem, index) => (
        <TableRow key={index}>
          <RowNumberCell index={index + 1} />
          {columns.map((column) => (
            <DefaultTableCell key={column.field}>
              {getColumnValue(rowItem, column.field) as string}
            </DefaultTableCell>
          ))}
        </TableRow>
      ))}
    </tbody>
  );
};

export { TableBody };

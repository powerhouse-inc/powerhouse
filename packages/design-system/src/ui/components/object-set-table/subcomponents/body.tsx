import { useCallback } from "react";
import type { ColumnDef, DataType } from "../types.js";
import { getColumnValue } from "../utils.js";
import { DefaultTableCell } from "./cells/default-cell.js";
import { RowNumberCell } from "./cells/row-number-cell.js";
import { TableRow } from "./rows/table-row.js";
import { useInternalTableState } from "./table-provider/table-provider.js";

interface TableBodyProps<T extends DataType> {
  data: T[];
  columns: ColumnDef[];
}

const TableBody = <T extends DataType>({
  data,
  columns,
}: TableBodyProps<T>) => {
  const {
    config: { allowRowSelection },
    state: { dispatch, selectedRowIndexes },
  } = useInternalTableState();

  const createSelectRowOnClickHandler = useCallback(
    (index: number) => (e: React.MouseEvent<HTMLTableCellElement>) => {
      if (!allowRowSelection) return;
      if (e.ctrlKey) {
        e.stopPropagation();
        dispatch?.({ type: "TOGGLE_SELECTED_ROW", payload: index });
      } else {
        dispatch?.({ type: "SELECT_ROW", payload: index });
      }
    },
    [dispatch, allowRowSelection],
  );

  const createAddSelectedRowHandler = useCallback(
    (index: number) => (e: React.MouseEvent<HTMLTableRowElement>) => {
      if (!allowRowSelection) return;
      if (e.ctrlKey) {
        e.stopPropagation();
        dispatch?.({ type: "TOGGLE_SELECTED_ROW", payload: index });
      }
    },
    [dispatch, allowRowSelection],
  );

  return (
    <tbody className="text-sm leading-5 text-gray-900">
      {data.map((rowItem, index) => (
        <TableRow
          key={index}
          index={index}
          onClick={createAddSelectedRowHandler(index)}
        >
          <RowNumberCell
            index={index + 1}
            handleSelectRowOnClick={createSelectRowOnClickHandler(index)}
            selected={selectedRowIndexes.includes(index)}
          />
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

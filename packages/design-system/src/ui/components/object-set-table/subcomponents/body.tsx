import { useCallback } from "react";
import type { CellContext, ColumnDef, DataType } from "../types.js";
import { DefaultTableCell } from "./cells/default-cell.js";
import { InformationCell } from "./cells/information-cell.js";
import { RowNumberCell } from "./cells/row-number-cell.js";
import { TableRow } from "./rows/table-row.js";
import { useInternalTableState } from "./table-provider/table-provider.js";

interface TableBodyProps<T extends DataType> {
  data: T[];
  columns: ColumnDef<T>[];
}

const TableBody = <T extends DataType>({
  data,
  columns,
}: TableBodyProps<T>) => {
  const {
    config,
    state: { dispatch, selectedRowIndexes },
  } = useInternalTableState<T>();

  const { allowRowSelection } = config;

  /**
   * Create a handler for the click event on the table numbering cell
   * This handler is used to select a row when the ctrl key is pressed
   * or select single rows when the index is clicked
   */
  const createSelectRowOnClickHandler = useCallback(
    (index: number) => (e: React.MouseEvent<HTMLTableCellElement>) => {
      if (!allowRowSelection) return;
      if (e.ctrlKey) {
        e.stopPropagation();
        dispatch?.({ type: "TOGGLE_SELECTED_ROW", payload: { index } });
      } else if (e.shiftKey) {
        return; // just let the row handle it
      } else {
        dispatch?.({
          type: "TOGGLE_SELECTED_ROW",
          payload: { index, clearOtherSelections: true },
        });
      }
    },
    [dispatch, allowRowSelection],
  );

  /**
   * Create a handler for the click event on the table row
   * This handler is used to select a row when the ctrl key is pressed
   * in any other place other than the index cell or select a range of rows
   * when the shift key is pressed
   */
  const createAddSelectedRowHandler = useCallback(
    (index: number) => (e: React.MouseEvent<HTMLTableRowElement>) => {
      if (!allowRowSelection) return;
      if (e.ctrlKey) {
        dispatch?.({ type: "TOGGLE_SELECTED_ROW", payload: { index } });
      } else if (e.shiftKey) {
        // Prevent text selection when shift key is pressed
        document.getSelection()?.removeAllRanges();
        dispatch?.({ type: "SELECT_ROW_RANGE", payload: index });
      }
    },
    [dispatch, allowRowSelection],
  );

  /**
   * Prevent text selection when shift key is pressed so that we
   * can select a range of rows while keeping a good user experience
   */
  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLTableRowElement>) => {
      if (event.shiftKey) {
        document.getSelection()?.removeAllRanges();
      }
    },
    [],
  );

  return (
    <tbody className="text-sm leading-5 text-gray-900">
      {data.map((rowItem, index) => (
        <TableRow
          // TODO: replace key with unique key (maybe generated with object-hash package)
          key={index}
          index={index}
          onClick={createAddSelectedRowHandler(index)}
          onMouseDown={handleMouseDown}
        >
          <RowNumberCell
            index={index + 1}
            handleSelectRowOnClick={createSelectRowOnClickHandler(index)}
            selected={selectedRowIndexes.includes(index)}
          />

          {columns.map((column) => {
            const cellContext: CellContext<T> = {
              row: rowItem,
              column,
              rowIndex: index,
              tableConfig: config,
            };

            // get and format the cell value
            const cellValue = column.valueFormatter?.(
              column.valueGetter?.(rowItem, cellContext),
              cellContext,
            );

            // render the cell
            const cell = column.renderCell?.(cellValue, cellContext);

            return (
              <DefaultTableCell key={column.field}>{cell}</DefaultTableCell>
            );
          })}

          {/* Information cell */}
          <InformationCell />
        </TableRow>
      ))}
    </tbody>
  );
};

export { TableBody };

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import type { DataType, ObjectSetTableConfig } from "../../types.js";
import { getDirectionFromKey, getNextSelectedCell } from "../../utils.js";
import { tableReducer, type TableState } from "./table-reducer.js";

interface TableContextValue<T extends DataType = DataType> {
  config: ObjectSetTableConfig<T>;
  state: TableState<T>;
}

const TableContext = createContext<TableContextValue | null>(null);

interface TableProviderProps<T extends DataType = DataType> {
  children: ReactNode;
  /**
   * Augmented table config adding default values for missing properties
   */
  config: ObjectSetTableConfig<T>;
  /**
   * Ref to the table element
   */
  tableRef: React.RefObject<HTMLTableElement>;
}

const TableProvider = <T extends DataType>({
  children,
  config,
  tableRef,
}: TableProviderProps<T>) => {
  const [state, dispatch] = useReducer(tableReducer, {
    columns: config.columns,
    data: config.data,
    allowRowSelection: config.allowRowSelection ?? true,
    showRowNumbers: config.showRowNumbers ?? true,
    selectedRowIndexes: [],
    lastSelectedRowIndex: null,
    selectedCellIndex: null,
    isCellEditMode: false,
  });

  useEffect(() => {
    dispatch({ type: "SET_DISPATCH", payload: dispatch });
  }, [dispatch]);

  const stateRef = useRef(state);
  const configRef = useRef(config);
  useEffect(() => {
    stateRef.current = state;
    configRef.current = config;
  }, [state, config]);

  const moveSelectedCell = (
    direction: "right" | "left" | "down" | "up",
    moveToNextRow = false, // TODO: implement this
  ) => {
    const currentSelectedCell = stateRef.current.selectedCellIndex;
    if (currentSelectedCell === null) {
      // if no cell is selected, select the first cell
      dispatch({ type: "SELECT_CELL", payload: { row: 0, column: 0 } });
      return;
    }

    const columnCount = configRef.current.columns.length;
    const rowCount = configRef.current.data.length;

    // move to next row
    const nextRowIndex =
      direction === "up" && currentSelectedCell.row > 0
        ? currentSelectedCell.row - 1
        : direction === "down" && currentSelectedCell.row < rowCount - 1
          ? currentSelectedCell.row + 1
          : currentSelectedCell.row;

    // move horizontally
    const canMoveHorizontally =
      (direction === "right" && currentSelectedCell.column + 1 < columnCount) ||
      (direction === "left" && currentSelectedCell.column - 1 >= 0);

    const nextCell = {
      row: nextRowIndex,
      column: canMoveHorizontally
        ? currentSelectedCell.column + (direction === "right" ? 1 : -1)
        : currentSelectedCell.column,
    };
    dispatch({ type: "SELECT_CELL", payload: nextCell });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isEditing = stateRef.current.isCellEditMode;
      const selectedCell = stateRef.current.selectedCellIndex;

      if (isEditing) {
        if (e.key === "Enter") {
          alert("save");
        }
        if (e.key === "Escape") {
          dispatch({ type: "SELECT_CELL", payload: selectedCell });
        }
      } else {
        if (
          e.key === "Enter" &&
          !!selectedCell &&
          configRef.current.columns[selectedCell.column].editable
        ) {
          dispatch({ type: "ENTER_CELL_EDIT_MODE", payload: selectedCell });
        }

        // arrow keys
        if (
          ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Tab"].includes(
            e.key,
          )
        ) {
          const direction = getDirectionFromKey(e.key);
          const nextCell = getNextSelectedCell({
            direction,
            currentCell: stateRef.current.selectedCellIndex,
            rowCount: configRef.current.data.length,
            columnCount: configRef.current.columns.length,
            moveToNextRow: e.key === "Tab",
          });
          if (e.key === "Tab") {
            e.preventDefault();
          }
          dispatch({ type: "SELECT_CELL", payload: nextCell });
        }
      }
    };

    tableRef.current?.addEventListener("keydown", handleKeyDown);
    return () => {
      tableRef.current?.removeEventListener("keydown", handleKeyDown);
    };
  }, [dispatch]);

  return (
    <TableContext.Provider
      value={{
        config,
        state,
      }}
    >
      {children}
    </TableContext.Provider>
  );
};

const useInternalTableState = <T extends DataType = any>() => {
  const context = useContext(TableContext) as TableContextValue<T>;
  if (!context) {
    throw new Error("useTable must be used within a TableProvider");
  }
  return context;
};

export { TableProvider, useInternalTableState };

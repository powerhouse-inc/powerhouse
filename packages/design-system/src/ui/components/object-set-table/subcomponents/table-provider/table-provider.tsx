import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import type { DataType, ObjectSetTableConfig } from "../../types.js";
import { tableReducer, type TableState } from "./table-reducer.js";

interface TableContextValue<T extends DataType = DataType> {
  config: ObjectSetTableConfig<T>;
  state: TableState<T>;
}

const TableContext = createContext<TableContextValue | null>(null);

interface TableProviderProps<T extends DataType = DataType> {
  children: ReactNode;
  config: ObjectSetTableConfig<T>;
}

const TableProvider = <T extends DataType>({
  children,
  config,
}: TableProviderProps<T>) => {
  const [state, dispatch] = useReducer(tableReducer, {
    columns: config.columns,
    data: config.data,
    allowRowSelection: config.allowRowSelection ?? true,
    showRowNumbers: config.showRowNumbers ?? true,
    selectedRowIndexes: [],
    lastSelectedRowIndex: null,
    selectedCellIndexes: null,
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
    const currentSelectedCell = stateRef.current.selectedCellIndexes;
    if (currentSelectedCell === null) {
      // if no cell is selected, select the first cell
      dispatch({ type: "SELECT_CELL", payload: { index: 0, column: 0 } });
      return;
    }

    const columnCount = configRef.current.columns.length;
    const rowCount = configRef.current.data.length;

    // move to next row
    const nextRowIndex =
      direction === "up" && currentSelectedCell.index > 0
        ? currentSelectedCell.index - 1
        : direction === "down" && currentSelectedCell.index < rowCount - 1
          ? currentSelectedCell.index + 1
          : currentSelectedCell.index;

    // move horizontally
    const canMoveHorizontally =
      (direction === "right" && currentSelectedCell.column + 1 < columnCount) ||
      (direction === "left" && currentSelectedCell.column - 1 >= 0);

    const nextCell = {
      index: nextRowIndex,
      column: canMoveHorizontally
        ? currentSelectedCell.column + (direction === "right" ? 1 : -1)
        : currentSelectedCell.column,
    };
    dispatch({ type: "SELECT_CELL", payload: nextCell });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isEditing = stateRef.current.isCellEditMode;
      const selectedCell = stateRef.current.selectedCellIndexes;

      if (isEditing) {
        if (e.key === "Enter") {
          alert("save");
        }
        if (e.key === "Escape") {
          dispatch({ type: "SELECT_CELL", payload: selectedCell! });
        }
      } else {
        if (e.key === "Enter" && !!selectedCell) {
          dispatch({ type: "ENTER_CELL_EDIT_MODE", payload: selectedCell });
        }

        // arrow keys
        if (e.key === "ArrowRight") {
          moveSelectedCell("right");
        }
        if (e.key === "ArrowLeft") {
          moveSelectedCell("left");
        }
        if (e.key === "ArrowDown") {
          moveSelectedCell("down");
        }
        if (e.key === "ArrowUp") {
          moveSelectedCell("up");
        }
        if (e.key === "Tab") {
          moveSelectedCell("right", true);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
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

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
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
  });

  useEffect(() => {
    dispatch({ type: "SET_DISPATCH", payload: dispatch });
  }, [dispatch]);

  return (
    <TableContext.Provider
      value={{
        config: {
          ...config,
          allowRowSelection: config.allowRowSelection ?? true,
          showRowNumbers: config.showRowNumbers ?? true,
        },
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

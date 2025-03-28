import { createContext, useContext, useReducer, type ReactNode } from "react";
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
  });

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

const useInternalTableState = () => {
  const context = useContext(TableContext);
  if (!context) {
    throw new Error("useTable must be used within a TableProvider");
  }
  return context;
};

export { TableProvider, useInternalTableState };

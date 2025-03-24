import { createContext, useReducer, type ReactNode } from "react";
import type { DataType, ObjectSetTableConfig } from "../../types.js";
import { tableReducer } from "./table-reducer.js";

interface TableContextValue<T extends DataType = DataType> {
  config: ObjectSetTableConfig<T>;
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
  });

  return (
    <TableContext.Provider value={{ config }}>{children}</TableContext.Provider>
  );
};

export { TableProvider };

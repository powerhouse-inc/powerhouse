import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { TableApi } from "../../logic/table-api.js";
import type { DataType, ObjectSetTableConfig } from "../../types.js";
import { tableReducer, type TableState } from "./table-reducer.js";

interface TableContextValue<T extends DataType = DataType> {
  config: ObjectSetTableConfig<T>;
  state: TableState<T>;
  api: TableApi<T>;
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
  const [state, dispatch] = useReducer(tableReducer<T>, {
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

  const api = useMemo(() => new TableApi<T>(tableRef, configRef, stateRef), []);

  return (
    <TableContext.Provider
      value={{
        config,
        state,
        api,
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

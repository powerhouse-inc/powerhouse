import {
  type CashAsset,
  type EditorAction,
  type EditorDispatcher,
  type FixedIncome,
  getActionOperationType,
  getCashAsset,
  getFixedIncomeAssets,
  getStateKeyForTableName,
  getTableNameFor,
  makeTableData,
  type Operation,
  type RealWorldAssetsState,
  type TableItemType,
  type TableName,
} from "@/rwa";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

export type RWAEditorContextProps = {
  readonly isAllowedToCreateDocuments: boolean;
  readonly isAllowedToEditDocuments: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onSwitchboardLinkClick: (() => void) | undefined;
  readonly onExport: () => void;
  readonly onClose: () => void;
  readonly onShowRevisionHistory: () => void;
};
type TEditorContext = RWAEditorContextProps &
  RealWorldAssetsState & {
    readonly cashAsset: CashAsset;
    readonly fixedIncomes: FixedIncome[];
    readonly selectedTableItem: TableItemType<TableName> | null;
    readonly selectedTableName: TableName | null;
    readonly operation: Operation;
    readonly viewItem: (
      item: TableItemType<TableName>,
      tableName: TableName,
    ) => void;
    readonly createItem: (tableName: TableName) => void;
    readonly editItem: (
      item: TableItemType<TableName>,
      tableName: TableName,
    ) => void;
    readonly clearSelected: () => void;
    readonly getIsFormOpen: (tableName: TableName) => boolean;
    readonly handleAction: (action: EditorAction) => void;
    readonly handleUndo: () => void;
    readonly handleRedo: () => void;
  };

const defaultEditorContextValue: TEditorContext = {
  accounts: [],
  fixedIncomeTypes: [],
  portfolio: [],
  principalLenderAccountId: "",
  serviceProviderFeeTypes: [],
  spvs: [],
  transactions: [],
  fixedIncomes: [],
  cashAsset: {
    id: "",
    type: "Cash",
    currency: "USD",
    balance: 0,
    spvId: "",
  },
  isAllowedToCreateDocuments: false,
  isAllowedToEditDocuments: false,
  canUndo: false,
  canRedo: false,
  operation: null,
  onSwitchboardLinkClick: undefined,
  selectedTableItem: null,
  selectedTableName: null,
  getIsFormOpen: () => false,
  clearSelected: () => {},
  viewItem: () => {},
  createItem: () => {},
  editItem: () => {},
  onExport: () => {},
  onClose: () => {},
  handleUndo: () => {},
  handleRedo: () => {},
  onShowRevisionHistory: () => {},
  handleAction: () => {},
};

const EditorContext = createContext(defaultEditorContextValue);
EditorContext.displayName = "EditorContext";

type TableState = {
  selectedTableItem: TableItemType<TableName> | null;
  selectedTableName: TableName | null;
  operation: Operation;
};

type TableAction =
  | {
      type: "VIEW_ITEM";
      item: TableItemType<TableName>;
      tableName: TableName;
    }
  | { type: "CREATE_ITEM"; tableName: TableName }
  | {
      type: "EDIT_ITEM";
      item: TableItemType<TableName>;
      tableName: TableName;
    }
  | { type: "CLEAR_SELECTED" };

function tableReducer(state: TableState, action: TableAction): TableState {
  switch (action.type) {
    case "VIEW_ITEM":
      return {
        selectedTableItem: action.item,
        selectedTableName: action.tableName,
        operation: "view",
      };
    case "CREATE_ITEM":
      return {
        selectedTableItem: null,
        selectedTableName: action.tableName,
        operation: "create",
      };
    case "EDIT_ITEM":
      return {
        selectedTableItem: action.item,
        selectedTableName: action.tableName,
        operation: "edit",
      };
    case "CLEAR_SELECTED":
      return {
        selectedTableItem: null,
        selectedTableName: null,
        operation: null,
      };
    default:
      return state;
  }
}

export function RWAEditorContextProvider(
  props: RWAEditorContextProps & {
    readonly children: ReactNode;
    readonly state: RealWorldAssetsState;
    readonly editorDispatcher: EditorDispatcher;
    readonly undo: () => void;
    readonly redo: () => void;
  },
) {
  const {
    children,
    state,
    isAllowedToCreateDocuments,
    isAllowedToEditDocuments,
    canUndo,
    canRedo,
    undo,
    redo,
    editorDispatcher,
    onExport,
    onClose,
    onSwitchboardLinkClick,
    onShowRevisionHistory,
  } = props;
  const [editorState, setEditorState] = useState(state);
  const stateRef = useRef(state);
  const [tableState, tableDispatch] = useReducer(tableReducer, {
    selectedTableItem: null,
    selectedTableName: null,
    operation: null,
  });

  const { selectedTableItem, selectedTableName, operation } = tableState;

  useEffect(() => {
    if (operation === null || operation === "view") {
      setEditorState(stateRef.current);
    }
  }, [operation, state]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const {
    accounts,
    fixedIncomeTypes,
    portfolio,
    principalLenderAccountId,
    serviceProviderFeeTypes,
    spvs,
    transactions,
  } = editorState;

  const cashAsset = useMemo(() => getCashAsset(portfolio), [portfolio]);

  const fixedIncomes = useMemo(
    () => getFixedIncomeAssets(portfolio),
    [portfolio],
  );

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    undo();
  }, [canUndo, undo]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    redo();
  }, [canRedo, redo]);

  const getIsFormOpen = useCallback(
    (tableName: TableName) => selectedTableName === tableName,
    [selectedTableName],
  );

  const viewItem = useCallback(
    (item: TableItemType<TableName>, tableName: TableName) => {
      tableDispatch({ type: "VIEW_ITEM", item, tableName });
    },
    [],
  );

  const createItem = useCallback((tableName: TableName) => {
    tableDispatch({ type: "CREATE_ITEM", tableName });
  }, []);

  const editItem = useCallback(
    (item: TableItemType<TableName>, tableName: TableName) => {
      tableDispatch({ type: "EDIT_ITEM", item, tableName });
    },
    [],
  );

  const clearSelected = useCallback(() => {
    tableDispatch({ type: "CLEAR_SELECTED" });
    setEditorState(stateRef.current);
  }, []);

  const handleAction = useCallback(
    (action: EditorAction) => {
      try {
        const result = editorDispatcher(action);
        const actionOperationType = getActionOperationType(action);

        if (actionOperationType === "DELETE" || !result) {
          clearSelected();
          return;
        }
        const tableName = getTableNameFor(action);
        const stateKey = getStateKeyForTableName(tableName);
        const currentStateForKey = stateRef.current[stateKey];
        if (typeof currentStateForKey === "string") return;

        if (actionOperationType === "CREATE") {
          const newStateForKey = [...currentStateForKey, result];
          const newState = {
            ...stateRef.current,
            [stateKey]: newStateForKey,
          };
          stateRef.current = newState;
          setEditorState(newState);

          if (tableName === selectedTableName) {
            const newTableData = makeTableData(tableName, newState);
            const newTableItem = newTableData.find(
              (item) => item.id === result.id,
            );

            if (newTableItem) {
              viewItem(newTableItem, tableName);
            }
          }
        }

        if (actionOperationType === "EDIT") {
          const newStateForKey = currentStateForKey.map((item) =>
            item.id === result.id ? result : item,
          );
          const newState = {
            ...stateRef.current,
            [stateKey]: newStateForKey,
          };
          stateRef.current = newState;
          setEditorState(newState);
          const newTableData = makeTableData(tableName, newState);
          const newTableItem = newTableData.find(
            (item) => item.id === result.id,
          );
          if (newTableItem) {
            editItem(newTableItem, tableName);
          }
        }
      } catch (error) {
        console.error(`Failed to dispatch action ${action.type}`, error);
      }
    },
    [clearSelected, editorDispatcher, editItem, selectedTableName, viewItem],
  );

  const value = useMemo(
    () => ({
      accounts,
      fixedIncomeTypes,
      portfolio,
      principalLenderAccountId,
      serviceProviderFeeTypes,
      spvs,
      transactions,
      cashAsset,
      fixedIncomes,
      canUndo,
      canRedo,
      isAllowedToCreateDocuments,
      isAllowedToEditDocuments,
      selectedTableItem,
      selectedTableName,
      operation,
      handleAction,
      handleUndo,
      handleRedo,
      viewItem,
      createItem,
      editItem,
      clearSelected,
      getIsFormOpen,
      onExport,
      onClose,
      onSwitchboardLinkClick,
      onShowRevisionHistory,
    }),
    [
      accounts,
      canRedo,
      canUndo,
      cashAsset,
      clearSelected,
      createItem,
      editItem,
      fixedIncomeTypes,
      fixedIncomes,
      getIsFormOpen,
      handleAction,
      handleRedo,
      handleUndo,
      isAllowedToCreateDocuments,
      isAllowedToEditDocuments,
      onClose,
      onExport,
      onShowRevisionHistory,
      onSwitchboardLinkClick,
      operation,
      portfolio,
      principalLenderAccountId,
      selectedTableItem,
      selectedTableName,
      serviceProviderFeeTypes,
      spvs,
      transactions,
      viewItem,
    ],
  );
  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  );
}

export function useEditorContext() {
  return useContext(EditorContext);
}

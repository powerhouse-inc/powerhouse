import type { ColumnDef, DataType } from "../../types.js";

interface TableState<T extends DataType = DataType> {
  dispatch?: React.Dispatch<TableAction<T>>;

  columns: ColumnDef[];
  data: T[];
  allowRowSelection: boolean;
  showRowNumbers: boolean;
  selectedRowIndexes: number[];
}

type TableAction<T extends DataType = DataType> =
  | {
      type: "SET_DISPATCH";
      payload: React.Dispatch<TableAction<T>>;
    }
  | {
      type: "SET_COLUMNS";
      payload: ColumnDef[];
    }
  | {
      type: "SET_DATA";
      payload: T[];
    }
  | {
      type: "UPDATE_COLUMN";
      payload: {
        index: number;
        column: Partial<ColumnDef>;
      };
    }
  // Row selection
  | {
      type: "SELECT_ROW";
      payload: number;
    }
  | {
      type: "TOGGLE_SELECTED_ROW";
      payload: number;
    }
  | {
      type: "TOGGLE_SELECT_ALL_ROWS";
    };

const tableReducer = <T extends DataType>(
  state: TableState<T>,
  action: TableAction<T>,
): TableState<T> => {
  switch (action.type) {
    case "SET_DISPATCH":
      return {
        ...state,
        dispatch: action.payload,
      };
    case "SET_COLUMNS":
      return {
        ...state,
        columns: action.payload,
      };
    case "SET_DATA":
      return {
        ...state,
        data: action.payload,
      };
    case "UPDATE_COLUMN":
      return {
        ...state,
        columns: state.columns.map((column, index) =>
          index === action.payload.index
            ? { ...column, ...action.payload.column }
            : column,
        ),
      };
    case "SELECT_ROW":
      return {
        ...state,
        selectedRowIndexes: state.selectedRowIndexes.includes(action.payload)
          ? []
          : [action.payload],
      };
    case "TOGGLE_SELECTED_ROW":
      return {
        ...state,
        selectedRowIndexes: state.selectedRowIndexes.includes(action.payload)
          ? [
              ...state.selectedRowIndexes.filter(
                (index) => index !== action.payload,
              ),
            ]
          : [...state.selectedRowIndexes, action.payload],
      };
    case "TOGGLE_SELECT_ALL_ROWS":
      return {
        ...state,
        selectedRowIndexes:
          state.selectedRowIndexes.length === state.data.length
            ? []
            : Array.from({ length: state.data.length }, (_, index) => index),
      };
    default:
      return state;
  }
};

export { tableReducer };
export type { TableAction, TableState };


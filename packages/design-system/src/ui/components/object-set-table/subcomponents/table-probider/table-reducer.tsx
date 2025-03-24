import type { ColumnDef, DataType } from "../../types.js";

interface TableState<T extends DataType = DataType> {
  columns: ColumnDef[];
  data: T[];
}

type TableAction<T extends DataType = DataType> =
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
    };

const tableReducer = <T extends DataType>(
  state: TableState<T>,
  action: TableAction<T>,
): TableState<T> => {
  switch (action.type) {
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
    default:
      return state;
  }
};

export { tableReducer };
export type { TableAction, TableState };

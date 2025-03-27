import type { ColumnDef, DataType } from "../../types.js";

interface TableState<T extends DataType = DataType> {
  dispatch?: React.Dispatch<TableAction<T>>;

  columns: ColumnDef[];
  data: T[];
  allowRowSelection: boolean;
  showRowNumbers: boolean;
  selectedRowIndexes: number[];
  lastSelectedRowIndex: number | null;
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
      type: "TOGGLE_SELECTED_ROW";
      payload: { index: number; clearOtherSelections?: boolean };
    }
  | {
      type: "TOGGLE_SELECT_ALL_ROWS";
    }
  | {
      type: "SELECT_ROW_RANGE";
      // the payload is the end of the range, the start is the lastSelectedRowIndex
      payload: number;
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
    case "TOGGLE_SELECTED_ROW": {
      if (action.payload.clearOtherSelections) {
        // if clear other selections is enabled, we just toggle the current row
        return {
          ...state,
          lastSelectedRowIndex: action.payload.index,
          selectedRowIndexes: state.selectedRowIndexes.includes(
            action.payload.index,
          )
            ? []
            : [action.payload.index],
        };
      }

      // if clear other selections is not enabled, we toggle the current row
      // and keep the other rows selection as it is
      return {
        ...state,
        lastSelectedRowIndex: action.payload.index,
        selectedRowIndexes: state.selectedRowIndexes.includes(
          action.payload.index,
        )
          ? [
              ...state.selectedRowIndexes.filter(
                (index) => index !== action.payload.index,
              ),
            ]
          : [...state.selectedRowIndexes, action.payload.index],
      };
    }
    case "TOGGLE_SELECT_ALL_ROWS":
      return {
        ...state,
        lastSelectedRowIndex: null,
        selectedRowIndexes:
          state.selectedRowIndexes.length === state.data.length
            ? []
            : Array.from({ length: state.data.length }, (_, index) => index),
      };
    case "SELECT_ROW_RANGE": {
      if (
        state.lastSelectedRowIndex === null ||
        (state.selectedRowIndexes.length === 1 &&
          state.lastSelectedRowIndex === action.payload)
      ) {
        // there are no selected rows, so let's select just the payload index
        // IF THERE ARE SELECTED ROWS, WE'RE NOT HANDLING IT WELL SOMEWHERE ELSE
        return {
          ...state,
          selectedRowIndexes: [action.payload],
          lastSelectedRowIndex: action.payload,
        };
      }

      // we're selecting a range of rows
      const selectedRowIndexesSet = new Set(state.selectedRowIndexes);
      const [start, end] = [action.payload, state.lastSelectedRowIndex].sort();

      Array.from(
        { length: end - start + 1 },
        (_, index) => index + start,
      ).forEach((index) => selectedRowIndexesSet.add(index));

      return {
        ...state,
        selectedRowIndexes: [...selectedRowIndexesSet],
        lastSelectedRowIndex: action.payload,
      };
    }
    default:
      return state;
  }
};

export { tableReducer };
export type { TableAction, TableState };


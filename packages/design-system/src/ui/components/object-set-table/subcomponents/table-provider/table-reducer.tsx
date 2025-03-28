import type { ColumnDef, DataType } from "../../types.js";

interface TableState<T extends DataType = DataType> {
  dispatch?: React.Dispatch<TableAction<T>>;

  columns: ColumnDef[];
  data: T[];
  allowRowSelection: boolean;
  showRowNumbers: boolean;
  selectedRowIndexes: number[];
  lastSelectedRowIndex: number | null;

  selectedCellIndexes: {
    index: number;
    column: number;
  } | null;
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
    }
  // Cell selection
  | {
      type: "SELECT_CELL";
      payload: {
        index: number;
        column: number;
      };
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
          selectedCellIndexes: null,
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
        selectedCellIndexes: null,
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
        selectedCellIndexes: null,
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
          selectedCellIndexes: null,
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
        selectedCellIndexes: null,
        selectedRowIndexes: [...selectedRowIndexesSet],
        lastSelectedRowIndex: action.payload,
      };
    }
    case "SELECT_CELL": {
      // TODO: check first if there is not other cell in edit mode
      return {
        ...state,
        selectedCellIndexes: action.payload,
        // if the user try to select a range, we're going to select from the row that has the selected cell
        lastSelectedRowIndex: action.payload.index,
        selectedRowIndexes: [], // clear row selection
      };
    }
    default:
      return state;
  }
};

export { tableReducer };
export type { TableAction, TableState };

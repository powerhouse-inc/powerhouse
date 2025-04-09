import type { TableApi } from "./table-api.js";

class SelectionManager<TData> {
  constructor(private api: TableApi<TData>) {}

  /**
   * Checks if the table allows row selection
   */
  canSelectRows() {
    return this.api._getConfig().allowRowSelection;
  }

  /**
   * Checks if the table allows cell selection
   */
  canSelectCells() {
    return this.api._getConfig().allowRowSelection;
  }

  /**
   * Clears the selection of the table
   */
  clear() {
    this.api._getState().dispatch?.({ type: "SELECT_CELL", payload: null });
  }

  /**
   * Selects a single row in the table. Only one row can be selected at a time.
   *
   * @param rowIndex - The index of the row to select
   */
  selectRow(rowIndex: number) {
    if (!this.canSelectRows()) return;

    this.api._getState().dispatch?.({
      type: "TOGGLE_SELECTED_ROW",
      payload: { index: rowIndex, clearOtherSelections: true },
    });
  }

  /**
   * Toggles the selection of a row in the table.
   *
   * @param rowIndex - The index of the row to toggle
   */
  toggleRow(rowIndex: number) {
    if (!this.canSelectRows()) return;

    this.api._getState().dispatch?.({
      type: "TOGGLE_SELECTED_ROW",
      payload: { index: rowIndex },
    });
  }

  /**
   * Selects a range of rows from the last active row to the given row index.
   *
   * @param rowIndex - The index of the row to select from
   */
  selectFromLastActiveRow(rowIndex: number) {
    if (!this.canSelectRows()) return;

    this.api._getState().dispatch?.({
      type: "SELECT_ROW_RANGE",
      payload: rowIndex,
    });
  }

  /**
   * Selects all rows in the table.
   */
  selectAllRows() {
    if (!this.canSelectRows()) return;

    this.api._getState().dispatch?.({
      type: "SELECT_ROW_RANGE",
      payload: this.api._getState().data.length - 1,
    });
  }

  toggleSelectAll() {
    if (!this.canSelectRows()) return;

    this.api._getState().dispatch?.({
      type: "TOGGLE_SELECT_ALL_ROWS",
    });
  }

  /**
   * Selects a cell in the table.
   *
   * @param rowIndex - The index of the row to select
   * @param columnIndex - The index of the column to select
   */
  selectCell(rowIndex: number, columnIndex: number) {
    if (!this.canSelectCells()) return;

    this.api._getState().dispatch?.({
      type: "SELECT_CELL",
      payload: { row: rowIndex, column: columnIndex },
    });
  }
}

export { SelectionManager };

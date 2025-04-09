import type { ColumnDef, DataType, TableCellIndex } from "./types.js";

/**
 * Get the title of a column.
 *
 * @param column - The column to get the title of.
 * @returns The title of the column.
 *
 * @example
 * ```ts
 * const title = getColumnTitle({ field: "name" }) // "Name"
 * const title = getColumnTitle({ field: "address.city" }) // "City"
 * const title = getColumnTitle({ field: "address.code", title: "Country" }) // "Country"
 * ```
 */
export const getColumnTitle = (column: ColumnDef) => {
  if (column.title) {
    return column.title;
  }

  // Handle dot notation by taking only the last part
  const fieldName = column.field.split(".").pop() || column.field;

  // this is a humanized version of the field name handling camelCase, snake_case and kebab-case
  // Handle different cases by inserting spaces
  const humanized = fieldName
    // Insert space before uppercase letters that follow lowercase or numbers
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    // Replace underscores and hyphens with spaces
    .replace(/[_-]/g, " ")
    // Capitalize the first letter
    .replace(/^\w/, (c) => c.toUpperCase());

  return humanized;
};

/**
 * Get the value of a column from a data object using dot notation.
 *
 * @param value - The data object.
 * @param field - The field to get the value of. It can be a dot notation string.
 * @returns The value of the field or undefined if the field is not found.
 *
 * @example
 * ```ts
 * const value = {
 *  name: "John",
 *  address: {
 *    city: "San Francisco",
 *  }
 * }
 *
 * getColumnValue(value, "name") // "John"
 * getColumnValue(value, "address.city") // "San Francisco"
 * getColumnValue(value, "address.country") // undefined
 * getColumnValue(value, "address") // { city: "San Francisco" }
 * ```
 */
export const getColumnValue = (value: DataType, field: string): unknown => {
  const keys = field.split(".");
  let current = value as Record<string, unknown>;
  for (const key of keys) {
    if (typeof current !== "object" || !(key in current)) {
      return undefined;
    }
    current = current[key] as Record<string, unknown>;
  }
  return current;
};

export type NextSelectedCellDirection = "right" | "left" | "down" | "up";

interface GetNextSelectedCellOptions {
  /**
   * The direction to move the selected cell.
   */
  direction: NextSelectedCellDirection;
  /**
   * The current cell.
   */
  currentCell: TableCellIndex | null;
  /**
   * The number of rows in the table.
   */
  rowCount: number;
  /**
   * The number of columns in the table.
   */
  columnCount: number;
  /**
   * Whether to move to the next row when the current cell is at the last column.
   */
  moveToNextRow?: boolean;
}

/**
 * Get the next selected cell based on the direction and the current cell.
 *
 * @param options - The options for the next selected cell.
 * @returns The next selected cell.
 *
 * @example
 * ```ts
 * const nextCell = getNextSelectedCell({ direction: "right", currentCell: { row: 0, column: 0 }, rowCount: 3, columnCount: 3 });
 * ```
 */
export const getNextSelectedCell = (
  options: GetNextSelectedCellOptions,
): TableCellIndex => {
  const {
    direction,
    currentCell,
    rowCount,
    columnCount,
    moveToNextRow = false,
  } = options;

  if (!currentCell) {
    // if there is no current cell, we're going to select the first cell
    return { row: 0, column: 0 };
  }

  const { row, column } = currentCell;

  switch (direction) {
    case "right":
      if (column < columnCount - 1) {
        return { row, column: column + 1 };
      } else {
        if (moveToNextRow) {
          return { row: (row + 1) % rowCount, column: 0 };
        } else {
          return { row, column: columnCount - 1 };
        }
      }
    case "left":
      if (column > 0) {
        return { row, column: column - 1 };
      } else {
        if (moveToNextRow) {
          return {
            row: row === 0 ? rowCount - 1 : row - 1,
            column: columnCount - 1,
          };
        } else {
          return { row, column: 0 };
        }
      }
    case "down":
      if (row < rowCount - 1) {
        return { row: row + 1, column };
      } else {
        if (moveToNextRow) {
          return { row: 0, column };
        } else {
          return { row, column };
        }
      }
    case "up":
      if (row > 0) {
        return { row: row - 1, column };
      } else {
        if (moveToNextRow) {
          return { row: rowCount - 1, column };
        } else {
          return { row, column };
        }
      }
    default:
      return currentCell;
  }
};

/**
 * Get the direction from a key.
 *
 * @param key - The key to get the direction from.
 * @returns The direction.
 */
export const getDirectionFromKey = (key: string): NextSelectedCellDirection => {
  switch (key) {
    case "ArrowRight":
    case "Tab":
      return "right";
    case "ArrowLeft":
      return "left";
    case "ArrowDown":
      return "down";
    case "ArrowUp":
      return "up";
    default:
      return "right";
  }
};

/**
 * Check if two cells are equal.
 *
 * @param cell1 - The first cell.
 * @param cell2 - The second cell.
 * @returns True if the cells are equal, false otherwise.
 */
export const isCellEqual = (
  cell1: TableCellIndex | null,
  cell2: TableCellIndex | null,
) => {
  if (!cell1 || !cell2) {
    return false;
  }
  return cell1.row === cell2.row && cell1.column === cell2.column;
};

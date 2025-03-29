import type { ColumnDef, DataType } from "./types.js";

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

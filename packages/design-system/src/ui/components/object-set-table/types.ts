export interface ObjectSetTableConfig<T> {
  /**
   * The columns to display in the table.
   */
  columns: ColumnDef[];

  /**
   * The data to display in the table.
   */
  data: T[];
}

export interface ColumnDef {
  /**
   * The field from the row object to display in the column.
   * You can use dot notation to access nested fields.
   *
   * @example
   * ```ts
   * {
   *  firstName: "Jhon",
   *  address: {
   *    city: "San Francisco",
   *  }
   * }
   *
   * // field: "firstName" -> (Jhon)
   * // field: "address.city" -> (San Francisco)
   * ```
   */
  field: string;

  /**
   * The title of the column.
   *
   * @default The field name capitalized.
   *
   * @example default title
   * ```ts
   * {
   *  field: "firstName",
   *  title: "First Name",
   * }
   * ```
   *
   * @example default for nested fields
   * ```ts
   * {
   *  field: "address.city",
   *  title: "City",
   * }
   * ```
   */
  title?: string;

  /**
   * The width of the column. It accepts any valid CSS width value.
   *
   * @default "auto"
   */
  width?: React.CSSProperties["width"];

  /**
   * The minimum width of the column. It accepts any valid CSS width value.
   *
   * @default "auto"
   */
  minWidth?: React.CSSProperties["minWidth"];

  /**
   * The maximum width of the column. It accepts any valid CSS width value.
   *
   * @default "auto"
   */
  maxWidth?: React.CSSProperties["maxWidth"];

  /**
   * The alignment of the column.
   *
   * @default "left"
   */
  align?: "left" | "center" | "right";
}

export type DataType = any;

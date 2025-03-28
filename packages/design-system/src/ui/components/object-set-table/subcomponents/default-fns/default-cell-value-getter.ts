import type { CellContext, ValueGetterFn } from "../../types.js";
import { getColumnValue } from "../../utils.js";

const defaultValueGetter = (<T>(row: T, context: CellContext<T>): unknown => {
  return getColumnValue(row, context.column.field);
}) as ValueGetterFn<any>;

export { defaultValueGetter };

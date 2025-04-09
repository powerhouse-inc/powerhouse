import {
  makeTableData,
  type TableItemType,
  type TableName,
  useEditorContext,
  useSortTableItems,
} from "#rwa";
import { useMemo } from "react";

export function useTableData<TTableName extends TableName>(
  tableName: TTableName,
) {
  const inputs = useEditorContext();

  // type inference is going wrong because some of the table data types have a "type" field.
  // even though this "type" field is not relevant to the table data type, typescript insists on including it in its type narrowing logic.
  const tableData = useMemo(() => {
    return makeTableData(tableName, inputs);
  }, [inputs, tableName]) as unknown as TableItemType<TTableName>[];

  const { sortedItems, sortHandler } = useSortTableItems(tableData);

  return useMemo(
    () =>
      ({
        tableData: sortedItems ?? [],
        sortHandler,
      }) as const,
    [sortedItems, sortHandler],
  );
}

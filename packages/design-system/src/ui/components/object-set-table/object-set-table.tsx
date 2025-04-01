/* eslint-disable react/jsx-max-depth */
import { useMemo, useRef } from "react";
import { TableBody } from "./subcomponents/body.js";
import { getRenderFn } from "./subcomponents/default-cell-renderers/get-render-fn.js";
import { defaultValueFormatter } from "./subcomponents/default-fns/default-cell-value-formatter.js";
import { defaultValueGetter } from "./subcomponents/default-fns/default-cell-value-getter.js";
import { TableHeader } from "./subcomponents/header.js";
import { TableFocusTrap } from "./subcomponents/table-focus-trap.js";
import { TableProvider } from "./subcomponents/table-provider/table-provider.js";
import type { DataType, ObjectSetTableConfig } from "./types.js";

/**
 * The ObjectSetTable component is a table component that displays a list of objects.
 *
 * @param columns The columns to display in the table.
 * @param data The data to display in the table.
 * @param allowRowSelection Whether to allow row selection.
 * @param showRowNumbers Whether to show row numbers.
 */
const ObjectSetTable = <T extends DataType = DataType>({
  ...config
}: ObjectSetTableConfig<T>) => {
  /**
   * Extend the config with default values in case they are not provided
   */
  const extendedConfig = useMemo(() => {
    const _config: ObjectSetTableConfig<T> = {
      ...config,
      columns: config.columns.map((column) => ({
        ...column,
        type: column.type ?? "text",
        valueGetter: column.valueGetter ?? defaultValueGetter,
        valueFormatter: column.valueFormatter ?? defaultValueFormatter,
        renderCell: column.renderCell ?? getRenderFn(column.type),
        editable: column.editable ?? false,
        // TODO: move the default onSave to a utility function
        onSave:
          column.onSave ??
          ((value, context) => {
            // TODO: fix this
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            config.data[context.rowIndex][context.column.field] = value;
            return true;
          }),
      })),
      allowRowSelection: config.allowRowSelection ?? true,
      showRowNumbers: config.showRowNumbers ?? true,
    };

    return _config;
  }, [config]);

  const tableRef = useRef<HTMLTableElement>(null);

  return (
    <TableProvider config={extendedConfig} tableRef={tableRef}>
      <TableFocusTrap>
        <div className="w-full overflow-hidden rounded-md border border-gray-300">
          <table ref={tableRef} className="h-px w-full overflow-x-auto">
            <TableHeader columns={extendedConfig.columns} />
            <TableBody
              data={extendedConfig.data}
              columns={extendedConfig.columns}
            />
          </table>
        </div>
      </TableFocusTrap>
    </TableProvider>
  );
};

export { ObjectSetTable };

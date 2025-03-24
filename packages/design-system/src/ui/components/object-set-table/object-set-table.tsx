import { TableProvider } from "./subcomponents/table-probider/table-provider.js";
import { Table } from "./table.js";
import type { DataType, ObjectSetTableConfig } from "./types.js";

const ObjectSetTable = <T extends DataType = DataType>(
  config: ObjectSetTableConfig<T>,
) => {
  return (
    <TableProvider config={config}>
      <div className="w-full overflow-hidden rounded-md border border-gray-300">
        <Table {...config} />
      </div>
    </TableProvider>
  );
};

export { ObjectSetTable };

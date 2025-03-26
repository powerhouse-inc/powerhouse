/* eslint-disable react/jsx-max-depth */
import { TableBody } from "./subcomponents/body.js";
import { TableHeader } from "./subcomponents/header.js";
import { TableProvider } from "./subcomponents/table-provider/table-provider.js";
import type { DataType, ObjectSetTableConfig } from "./types.js";

const ObjectSetTable = <T extends DataType = DataType>(
  config: ObjectSetTableConfig<T>,
) => {
  return (
    <TableProvider config={config}>
      <div className="w-full overflow-hidden rounded-md border border-gray-300">
        <table className="w-full overflow-x-auto">
          <TableHeader columns={config.columns} />
          <TableBody data={config.data} columns={config.columns} />
        </table>
      </div>
    </TableProvider>
  );
};

export { ObjectSetTable };

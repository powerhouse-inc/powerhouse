import { TableBody } from "./subcomponents/body.js";
import { TableHeader } from "./subcomponents/header.js";
import type { DataType, ObjectSetTableConfig } from "./types.js";

const Table = <T extends DataType = DataType>(
  config: ObjectSetTableConfig<T>,
) => {
  return (
    <table className="w-full overflow-x-auto">
      <TableHeader columns={config.columns} />
      <TableBody data={config.data} columns={config.columns} />
    </table>
  );
};

export { Table };

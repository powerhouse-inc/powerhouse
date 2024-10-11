import { getSchema as getSystemSchema } from "./system/subgraph";
import { getSchema as getDriveSchema } from "./drive/subgraph";

export const SUBGRAPH_REGISTRY = [
  {
    name: "system",
    getSchema: getSystemSchema,
  },
  {
    name: ":drive",
    getSchema: getDriveSchema,
  },
];

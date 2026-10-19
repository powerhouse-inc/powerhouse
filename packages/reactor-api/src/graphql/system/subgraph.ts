import { BaseSubgraph } from "../base-subgraph.js";
import type { SchemaBuilder } from "../subgraph-schema.js";
import { systemEntries, systemSchema } from "./schema.js";

export class SystemSubgraph extends BaseSubgraph {
  static override readonly subgraphName = systemSchema.subgraphName;

  static override getSchema(schema: SchemaBuilder<SystemSubgraph>) {
    return systemEntries(schema);
  }
}

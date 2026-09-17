import type { DB } from "./schema.js";
import type { IRelationalDb } from "@powerhousedao/shared/processors";

// The processor keeps no tables of its own: it forwards operations to the
// runtime, whose own stores own their schema.
export function up(_db: IRelationalDb<DB>): Promise<void> {
  return Promise.resolve();
}

export function down(_db: IRelationalDb<DB>): Promise<void> {
  return Promise.resolve();
}

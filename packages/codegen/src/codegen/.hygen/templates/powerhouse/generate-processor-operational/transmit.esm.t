---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/src/transmit.ts"
force: true
---
import { InternalTransmitterUpdate, Listener } from "document-drive";
import { eq } from "drizzle-orm";
import { PgDatabase } from "drizzle-orm/pg-core";
import { exampleTable } from "./db-schema";

/**
 * Handles an array of strands of operations.
 * Gets called if the options filter matches the strand.
 * @param strands - The strands of operations to handle.
 * @param db - The database to use.
 */
export async function transmit(
  strands: InternalTransmitterUpdate[],
  db: PgDatabase<any, any, any>
) {
  for (const strand of strands) {
    await handleStrand(strand, db);
  }
}

/**
 * Handles a single strand of operations.
 * @param strand - The strand of operations to handle.
 * @param db - The database to use.
 */
async function handleStrand(
  strand: InternalTransmitterUpdate,
  db: PgDatabase<any, any, any>
) {
  // reset db if first operation
  if (isFirstOperation(strand)) {
    await resetDb(db);
  }

  for (const op of strand.operations) {
    // get first entry
    const [entry] = await db
      .select()
      .from(exampleTable)
      .where(eq(exampleTable.id, strand.documentId));

    if (!entry) {
      // insert new entry if not exists
      await db.insert(exampleTable).values({ id: strand.documentId, value: 1 });
    } else {
      // update existing entry
      await db
        .update(exampleTable)
        .set({ value: entry.value + 1 })
        .where(eq(exampleTable.id, strand.documentId));
    }
  }
}

function isFirstOperation(strand: InternalTransmitterUpdate) {
  const [firstOperation] = strand.operations;
  if (firstOperation.index === 0) {
    return true;
  }
  return false;
}

async function resetDb(db: PgDatabase<any, any, any>) {
  await db.delete(exampleTable);
}

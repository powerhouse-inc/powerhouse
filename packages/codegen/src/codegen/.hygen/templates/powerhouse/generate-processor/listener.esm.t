---
to: "<%= rootDir %>/processors/<%= h.changeCase.param(name) %>/src/listener.ts"
force: true
---
import { InternalTransmitterUpdate, Listener } from "document-drive";
import { eq } from "drizzle-orm";
import { PgDatabase } from "drizzle-orm/pg-core";
import {
  AddPowtLineItemInput,
  DeletePowtLineItemInput,
  UpdatePowtLineItemInput,
} from "../../../document-models/contributor-bill";
import { exampleTable } from "./schema";

export const options: Omit<Listener, "driveId"> = {
  listenerId: "contributor-bill-analyzer",
  filter: {
    branch: ["main"],
    documentId: ["*"],
    documentType: ["powerhouse/contributor-bill"],
    scope: ["global"],
  },
  block: false,
  label: "contributor-bill-analyzer",
  system: true,
};

export async function transmit(
  strands: InternalTransmitterUpdate[],
  db: PgDatabase<any, any, any>
) {
  for (const strand of strands) {
    await handleStrand(strand, db);
  }
}

async function handleStrand(
  strand: InternalTransmitterUpdate,
  db: PgDatabase<any, any, any>
) {
  for (const op of strand.operations) {
    const [entry] = await db
      .select()
      .from(exampleTable)
      .where(eq(exampleTable.id, strand.documentId));

    if (!entry) {
      await db.insert(exampleTable).values({ id: strand.documentId, value: 1 });
    } else {
      await db
        .update(exampleTable)
        .set({ value: entry.value + 1 })
        .where(eq(exampleTable.id, strand.documentId));
    }
  }
}
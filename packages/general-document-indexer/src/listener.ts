import {
  InternalTransmitterUpdate,
  Listener,
  OperationUpdate,
} from "document-drive";
import {
  AddFileInput,
  CopyNodeInput,
  DeleteNodeInput,
  UpdateNodeInput,
} from "document-model-libs/document-drive";
import { and, eq } from "drizzle-orm";
import { PgDatabase } from "drizzle-orm/pg-core";
import { searchTable } from "./schema";

export const options: Omit<Listener, "driveId"> = {
  listenerId: "general-document-indexer",
  filter: {
    branch: ["*"],
    documentId: ["*"],
    documentType: ["powerhouse/document-drive"],
    scope: ["*"],
  },
  block: false,
  label: "general-document-indexer",
  system: true,
};

export async function transmit(
  strands: InternalTransmitterUpdate[],
  db: PgDatabase<any, any, any>
) {
  for (const strand of strands) {
    handleStrand(strand, db);
  }

  return Promise.resolve();
}

async function handleStrand(
  strand: InternalTransmitterUpdate,
  db: PgDatabase<any, any, any>
) {
  const firstOp = strand.operations[0];
  if (firstOp?.index === 0) {
    await db.delete(searchTable);
  }

  // ADD_FILE COPY_NODE, UPDATE_NODE, DELETE_NODE
  strand.operations.map(async (op: OperationUpdate) => {
    // AddFileInput --> insert into db
    if (op.type === "ADD_FILE") {
      await db.insert(searchTable).values({
        driveId: strand.driveId,
        documentId: (op.input as AddFileInput).id,
        objectId: (op.input as AddFileInput).id,
        label: (op.input as AddFileInput).name,
        type: (op.input as AddFileInput).documentType,
      });
    } else if (op.type === "COPY_NODE") {
      const [file] = await db
        .select()
        .from(searchTable)
        .where(
          and(
            eq(searchTable.driveId, strand.driveId),
            eq(searchTable.documentId, (op.input as CopyNodeInput).srcId)
          )
        );

      if (!file) {
        return false;
      }

      return db.insert(searchTable).values({
        driveId: strand.driveId,
        documentId: (op.input as CopyNodeInput).targetId,
        objectId: (op.input as CopyNodeInput).targetId,
        label: (op.input as CopyNodeInput).targetName ?? "unnamed",
        type: file.type,
      });
    } else if (op.type === "UPDATE_NODE") {
      const fieldsToUpdate: Record<string, any> = {};
      if ("name" in op.input) {
        fieldsToUpdate.label = (op.input as UpdateNodeInput).name ?? "unnamed";
      }
      await db
        .update(searchTable)
        .set({
          ...fieldsToUpdate,
        })
        .where(
          and(
            eq(searchTable.driveId, strand.driveId),
            eq(searchTable.documentId, (op.input as UpdateNodeInput).id),
            eq(searchTable.objectId, (op.input as UpdateNodeInput).id)
          )
        )
        .returning();
    } else if (op.type === "DELETE_NODE") {
      await db
        .delete(searchTable)
        .where(
          and(
            eq(searchTable.driveId, strand.driveId),
            eq(searchTable.documentId, (op.input as DeleteNodeInput).id),
            eq(searchTable.objectId, (op.input as DeleteNodeInput).id)
          )
        );
    }
  });
}

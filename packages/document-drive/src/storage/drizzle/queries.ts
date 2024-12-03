import { DocumentDriveStorage, DocumentStorage } from "../types";
import { documentsTable, drivesTable } from "./schema";
import { eq } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
export const getDriveBySlug = async (db: NodePgDatabase, slug: string) => {
  const result = await db
    .select()
    .from(drivesTable)
    .where(eq(drivesTable.slug, slug));
  return result.length > 0 ? result[0] : null;
};

export const upsertDrive = async (
  db: NodePgDatabase,
  id: string,
  drive: DocumentDriveStorage,
) => {
  const [result] = await db
    .update(drivesTable)
    .set({
      id,
    })
    .where(eq(drivesTable.slug, drive.initialState.state.global.slug ?? id))
    .returning();

  if (result) {
    return result;
  }

  return db.insert(drivesTable).values({
    id,
    slug: drive.initialState.state.global.slug ?? id,
  });
};

export const createDocumentQuery = async (
  db: NodePgDatabase,
  driveId: string,
  documentId: string,
  document: DocumentStorage,
) => {
  return db.insert(documentsTable).values({
    name: document.name,
    documentType: document.documentType,
    driveId,
    initialState: JSON.stringify(document.initialState),
    lastModified: document.lastModified,
    revision: JSON.stringify(document.revision),
    id: documentId,
  });
};

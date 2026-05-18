import type { Generated } from "kysely";

export interface DriveNodeTable {
  driveId: string;
  id: string;
  kind: "file" | "folder";
  name: string;
  requestedName: string;
  parentFolder: string | null;
  documentType: string | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface DocumentNameTable {
  docId: string;
  name: string;
  updatedAt: Generated<Date>;
}

export interface ReactorDriveDatabase {
  DriveNode: DriveNodeTable;
  DocumentName: DocumentNameTable;
}

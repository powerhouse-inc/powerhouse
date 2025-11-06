import type { Generated, Insertable, Selectable, Updateable } from "kysely";

export interface ViewStateTable {
  lastOperationId: number;
  lastOperationTimestamp: Generated<Date>;
}

export interface DocumentSnapshotTable {
  id: Generated<string>;
  documentId: string;
  slug: string | null;
  name: string | null;
  scope: string;
  branch: string;
  content: unknown; // JSONB type - stored as object
  documentType: string;
  lastOperationIndex: number;
  lastOperationHash: string;
  lastUpdatedAt: Generated<Date>;
  snapshotVersion: Generated<number>;
  identifiers: unknown | null; // JSONB type - stored as object
  metadata: unknown | null; // JSONB type - stored as object
  isDeleted: Generated<boolean>;
  deletedAt: Date | null;
}

export interface SlugMappingTable {
  slug: string;
  documentId: string;
  scope: string;
  branch: string;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface DocumentViewDatabase {
  ViewState: ViewStateTable;
  DocumentSnapshot: DocumentSnapshotTable;
  SlugMapping: SlugMappingTable;
}

export type ViewStateRow = Selectable<ViewStateTable>;
export type InsertableViewState = Insertable<ViewStateTable>;
export type UpdateableViewState = Updateable<ViewStateTable>;

export type DocumentSnapshotRow = Selectable<DocumentSnapshotTable>;
export type InsertableDocumentSnapshot = Insertable<DocumentSnapshotTable>;
export type UpdateableDocumentSnapshot = Updateable<DocumentSnapshotTable>;

export type SlugMappingRow = Selectable<SlugMappingTable>;
export type InsertableSlugMapping = Insertable<SlugMappingTable>;
export type UpdateableSlugMapping = Updateable<SlugMappingTable>;

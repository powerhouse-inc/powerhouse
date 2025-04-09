import { type DocumentDriveDocument } from "#drive-document-model/gen/types";
import { type PHDocument } from "document-model";

export interface IDocumentCache {}

export interface ICache {
  // When setting a document, the resulting state is pulled off of the last operation
  // and slapped onto the document state before cache.
  setDocument(documentId: string, document: PHDocument): Promise<void>;

  // When getting a document, the state will be populated.
  getDocument<TDocument extends PHDocument>(
    documentId: string,
  ): Promise<TDocument | undefined>;
  // @returns — true if a document existed and has been removed, or false if the document is not cached.
  deleteDocument(documentId: string): Promise<boolean>;

  // When setting a drive, the resulting state is pulled off of the last operation
  // and slapped onto the drive state before cache.
  setDrive(driveId: string, drive: DocumentDriveDocument): Promise<void>;

  // When setting a drive by slug, the resulting state is pulled off of the last operation
  // and slapped onto the drive state before cache.
  setDriveBySlug(slug: string, drive: DocumentDriveDocument): Promise<void>;

  // When getting a drive, the state will be populated.
  getDrive(driveId: string): Promise<DocumentDriveDocument | undefined>;

  // When getting a drive by slug, the state will be populated.
  getDriveBySlug(slug: string): Promise<DocumentDriveDocument | undefined>;

  deleteDrive(driveId: string): Promise<boolean>;
  deleteDriveBySlug(slug: string): Promise<boolean>;
}

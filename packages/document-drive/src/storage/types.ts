import { type DocumentDriveDocument } from "#drive-document-model/gen/types";
import { type SynchronizationUnitQuery } from "#server/types";
import type {
  DocumentHeader,
  Operation,
  OperationFromDocument,
  PHDocument,
} from "document-model";

export interface IDocumentStorage {
  /**
   * Returns true if and only if the document exists.
   *
   * @param documentId - The id of the document to check.
   */
  exists(documentId: string): Promise<boolean>;

  /**
   * Creates a new document with the given id.
   *
   * @param documentId - The id of the document to create.
   * @param document - The document to create.
   *
   * @throws Error if the document already exists.
   */
  create(documentId: string, document: PHDocument): Promise<void>;

  /**
   * Returns the document with the given id.
   *
   * @param documentId - The id of the document to get.
   *
   * @throws Error if the document does not exist.
   */
  get<TDocument extends PHDocument>(documentId: string): Promise<TDocument>;

  /**
   * Deletes the document with the given id.
   *
   * @param documentId - The id of the document to delete.
   *
   * @returns true if the document was deleted, false if it did not exist.
   */
  delete(documentId: string): Promise<boolean>;

  /**
   * Associates a child document with a parent document.
   *
   * A child document can belong to many parent documents. However, a child
   * cannot be added to itself, or added as a child of a child of itself.
   *
   * @param parentId - The id of the parent document.
   * @param childId - The id of the child document to add.
   */
  addChild(parentId: string, childId: string): Promise<void>;

  /**
   * Removes a child document from a parent document.
   *
   * @param parentId - The id of the parent document.
   * @param childId - The id of the child document to remove.
   *
   * @returns true if the child document was removed from the parent document,
   * false if the child document was not a child of the parent document.
   */
  removeChild(parentId: string, childId: string): Promise<boolean>;

  /**
   * Returns all child documents of the parent document with the given id.
   *
   * @param parentId - The id of the parent document.
   */
  getChildren(parentId: string): Promise<string[]>;

  //getParent(childId: string): Promise<string | undefined>;
}

export interface IStorage {
  addDocumentOperations<TDocument extends PHDocument>(
    drive: string,
    id: string,
    operations: OperationFromDocument<TDocument>[],
    header: DocumentHeader,
  ): Promise<void>;
  addDocumentOperationsWithTransaction?<TDocument extends PHDocument>(
    drive: string,
    id: string,
    callback: (document: TDocument) => Promise<{
      operations: OperationFromDocument<TDocument>[];
      header: DocumentHeader;
    }>,
  ): Promise<void>;
  getOperationResultingState?(
    drive: string,
    id: string,
    index: number,
    scope: string,
    branch: string,
  ): Promise<string | undefined>;
  getSynchronizationUnitsRevision(units: SynchronizationUnitQuery[]): Promise<
    {
      documentId: string;
      scope: string;
      branch: string;
      lastUpdated: string;
      revision: number;
    }[]
  >;
}

export interface IDriveStorage extends IStorage {
  getDrives(): Promise<string[]>;
  getDriveBySlug(slug: string): Promise<DocumentDriveDocument>;
  createDrive(id: string, drive: DocumentDriveDocument): Promise<void>;
  deleteDrive(id: string): Promise<void>;
  clearStorage?(): Promise<void>;
  addDriveOperations(
    id: string,
    operations: Operation[],
    header: DocumentHeader,
  ): Promise<void>;
  addDriveOperationsWithTransaction?(
    drive: string,
    callback: (document: DocumentDriveDocument) => Promise<{
      operations: Operation[];
      header: DocumentHeader;
    }>,
  ): Promise<void>;
  getDriveOperationResultingState?(
    drive: string,
    index: number,
    scope: string,
    branch: string,
  ): Promise<string | undefined>;
}

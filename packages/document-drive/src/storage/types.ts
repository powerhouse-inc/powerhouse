import { type DocumentDriveDocument } from "#drive-document-model/gen/types";
import { type SynchronizationUnitQuery } from "#server/types";
import type {
  Operation,
  OperationFromDocument,
  PHDocument,
} from "document-model";

/**
 * Describes the storage interface for documents.
 */
export interface IDocumentStorage {
  /**
   * Resolves a list of ids from a list of slugs.
   *
   * > TODO: This function is part of the future IDocumentView interface.
   *
   * @param slugs - Required, the list of document slugs
   * @param signal - Optional abort signal to cancel the request
   * @returns The parallel list of slugs
   */
  resolveIds(slugs: string[], signal?: AbortSignal): Promise<string[]>;

  /**
   * Resolves a list of slugs from a list of ids.
   *
   * @param ids - Required, the list of document ids
   * @param signal - Optional abort signal to cancel the request
   * @returns The parallel list of ids
   */
  resolveSlugs(ids: string[], signal?: AbortSignal): Promise<string[]>;

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
   * @throws Error if the document with a matching id OR slug already exists.
   */
  create(document: PHDocument): Promise<void>;

  /**
   * Returns the document with the given id.
   *
   * @param documentId - The id of the document to get.
   *
   * @throws Error if the document does not exist.
   */
  get<TDocument extends PHDocument>(documentId: string): Promise<TDocument>;

  /**
   * Returns the document with the given slug.
   *
   * @param slug - The slug of the document to get.
   *
   * @throws Error if the document does not exist.
   */
  getBySlug<TDocument extends PHDocument>(slug: string): Promise<TDocument>;

  /**
   * Returns ids of all documents of the given document-model type.
   *
   * @param documentModelType - The type of the documents to get.
   * @param limit - The maximum number of documents to return.
   * @param cursor - The cursor to start the search from.
   *
   */
  findByType(
    documentModelType: string,
    limit?: number,
    cursor?: string,
  ): Promise<{
    documents: string[];
    nextCursor: string | undefined;
  }>;

  /**
   * Deletes the document with the given id. Also deletes any child documents
   * that are only children of this document.
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

  /**
   * Returns all parent documents of the child document with the given id.
   *
   * @param childId - The id of the child document.
   */
  getParents(childId: string): Promise<string[]>;
}

/**
 * Storage interface that allows for deletion.
 */
export interface IDocumentAdminStorage extends IDocumentStorage {
  /**
   * Clears the storage.
   */
  clear(): Promise<void>;
}

/**
 * Describes the storage interface for document operations.
 */
export interface IDocumentOperationStorage {
  addDocumentOperations<TDocument extends PHDocument>(
    drive: string,
    id: string,
    operations: OperationFromDocument<TDocument>[],
    document: PHDocument,
  ): Promise<void>;

  addDocumentOperationsWithTransaction?<TDocument extends PHDocument>(
    drive: string,
    id: string,
    callback: (document: TDocument) => Promise<{
      operations: OperationFromDocument<TDocument>[];
      document: PHDocument;
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

/**
 * Describes the storage interface for drive operations.
 */
export interface IDriveOperationStorage extends IDocumentOperationStorage {
  addDriveOperations(
    id: string,
    operations: Operation[],
    document: PHDocument,
  ): Promise<void>;

  addDriveOperationsWithTransaction?(
    drive: string,
    callback: (document: DocumentDriveDocument) => Promise<{
      operations: Operation[];
      document: PHDocument;
    }>,
  ): Promise<void>;

  getDriveOperationResultingState?(
    drive: string,
    index: number,
    scope: string,
    branch: string,
  ): Promise<string | undefined>;
}

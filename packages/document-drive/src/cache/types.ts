import { type DocumentDriveDocument } from "#drive-document-model/gen/types";
import { type PHDocument } from "document-model";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
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
}

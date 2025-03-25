import { type PHDocument } from "document-model";

export interface ICache {
  setDocument(id: string, document: PHDocument): Promise<boolean>;
  getDocument<TDocument extends PHDocument>(
    id: string,
  ): Promise<TDocument | undefined>;

  // @returns — true if a document existed and has been removed, or false if the document is not cached.
  deleteDocument(id: string): Promise<boolean>;
}

import type { BaseDocument } from "document-model";

export interface ICache<TGlobalState, TLocalState> {
  setDocument(
    drive: string,
    id: string,
    document: BaseDocument<TGlobalState, TLocalState>,
  ): Promise<boolean>;
  getDocument(
    drive: string,
    id: string,
  ): Promise<BaseDocument<TGlobalState, TLocalState> | undefined>;

  // @returns — true if a document existed and has been removed, or false if the document is not cached.
  deleteDocument(drive: string, id: string): Promise<boolean>;
}

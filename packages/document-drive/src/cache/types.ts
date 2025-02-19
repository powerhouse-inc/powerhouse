import { Action, PHDocument } from "document-model";

export interface ICache {
  setDocument(
    drive: string,
    id: string,
    document: PHDocument,
  ): Promise<boolean>;
  getDocument<TGlobalState, TLocalState, TAction = Action>(
    drive: string,
    id: string,
  ): Promise<PHDocument<TGlobalState, TLocalState, TAction> | undefined>;

  // @returns — true if a document existed and has been removed, or false if the document is not cached.
  deleteDocument(drive: string, id: string): Promise<boolean>;
}

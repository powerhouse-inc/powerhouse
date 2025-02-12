import type { BaseAction, BaseDocument } from "document-model";

export interface ICache<TGlobalState, TLocalState, TAction extends BaseAction> {
  setDocument(
    drive: string,
    id: string,
    document: BaseDocument<TGlobalState, TLocalState, TAction>,
  ): Promise<boolean>;
  getDocument(
    drive: string,
    id: string,
  ): Promise<BaseDocument<TGlobalState, TLocalState, TAction> | undefined>;

  // @returns — true if a document existed and has been removed, or false if the document is not cached.
  deleteDocument(drive: string, id: string): Promise<boolean>;
}

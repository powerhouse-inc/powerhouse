import { BaseAction, BaseDocument } from "document-model";
import { ICache } from "./types.js";

class InMemoryCache<TGlobalState, TLocalState, TAction extends BaseAction>
  implements ICache<TGlobalState, TLocalState, TAction>
{
  private cache = new Map<
    string,
    Map<string, BaseDocument<TGlobalState, TLocalState, TAction>>
  >();

  async setDocument(
    drive: string,
    id: string,
    document: BaseDocument<TGlobalState, TLocalState, TAction>,
  ) {
    const global = document.operations.global.map((e) => {
      delete e.resultingState;
      return e;
    });
    const local = document.operations.local.map((e) => {
      delete e.resultingState;
      return e;
    });
    const doc = { ...document, operations: { global, local } };
    if (!this.cache.has(drive)) {
      this.cache.set(drive, new Map());
    }
    this.cache.get(drive)?.set(id, doc);
    return true;
  }

  async deleteDocument(drive: string, id: string) {
    return this.cache.get(drive)?.delete(id) ?? false;
  }

  async getDocument(drive: string, id: string) {
    return this.cache.get(drive)?.get(id);
  }
}

export default InMemoryCache;

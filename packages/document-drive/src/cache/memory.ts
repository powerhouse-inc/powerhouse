import { Action, type PHDocument } from "document-model";
import { type ICache } from "./types.js";

class InMemoryCache implements ICache {
  private cache = new Map<string, Map<string, PHDocument>>();

  async setDocument(drive: string, id: string, document: PHDocument) {
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

  async getDocument<TDocument extends PHDocument>(
    drive: string,
    id: string,
  ): Promise<TDocument | undefined> {
    return this.cache.get(drive)?.get(id) as TDocument | undefined;
  }
}

export default InMemoryCache;

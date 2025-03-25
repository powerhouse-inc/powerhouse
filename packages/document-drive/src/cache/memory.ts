import { type PHDocument } from "document-model";
import { type ICache } from "./types.js";

class InMemoryCache implements ICache {
  private cache = new Map<string, PHDocument>();

  async setDocument(id: string, document: PHDocument) {
    const global = document.operations.global.map((e) => {
      delete e.resultingState;
      return e;
    });
    const local = document.operations.local.map((e) => {
      delete e.resultingState;
      return e;
    });
    const doc = { ...document, operations: { global, local } };
    this.cache.set(id, doc);
    return true;
  }

  async deleteDocument(id: string) {
    return this.cache.delete(id);
  }

  async getDocument<TDocument extends PHDocument>(
    id: string,
  ): Promise<TDocument | undefined> {
    return this.cache.get(id) as TDocument | undefined;
  }
}

export default InMemoryCache;

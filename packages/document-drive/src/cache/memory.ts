import { logger } from "#utils/logger";
import { OperationsFromDocument, type PHDocument } from "document-model";
import { type IOperationsCache } from "../storage/types.js";
import { type ICache } from "./types.js";

class InMemoryCache implements ICache, IOperationsCache {
  private cache = new Map<string, Map<string, PHDocument>>();

  clear() {
    this.cache.clear();
  }

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

  async getCachedOperations<TDocument extends PHDocument = PHDocument>(
    drive: string,
    id: string,
  ): Promise<OperationsFromDocument<TDocument> | undefined> {
    try {
      const document = await this.getDocument<TDocument>(drive, id);
      return document?.operations;
    } catch (error) {
      logger.error(error);
      return undefined;
    }
  }
}

export default InMemoryCache;

import { type DocumentDriveDocument } from "#drive-document-model/gen/types";
import { type PHDocument } from "document-model";
import { type ICache } from "./types.js";
import { trimResultingState } from "./util.js";

export interface ICacheStorage<Value = unknown> {
  get(key: string): Value | undefined;
  set(key: string, value: Value): this;
  delete(key: string): boolean;
  clear(): void;
}

export interface ICacheStorageManager {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  createStorage<Value extends {}>(): ICacheStorage<Value>;
}

export class CacheStorageManager implements ICacheStorageManager {
  private index = 0;
  private cache: ICacheStorage;

  constructor(cache: ICacheStorage) {
    this.cache = cache;
  }
  createStorage<Value>(): ICacheStorage<Value> {
    const index = this.index;
    this.index += 1;

    function buildKey(key: string) {
      return `${index}-${key}`;
    }

    const storage: ICacheStorage<Value> = {
      get: (key: string) => {
        return this.cache.get(buildKey(key)) as Value;
      },
      set: (key: string, value: Value): ICacheStorage<Value> => {
        this.cache.set(buildKey(key), value);
        return storage;
      },
      delete: (key) => {
        return this.cache.delete(buildKey(key));
      },
      clear: () => {
        this.cache.clear();
      },
    };
    return storage;
  }
}

class InMemoryCache implements ICache {
  private cacheStorageManager: ICacheStorageManager;
  private idToDocument: ICacheStorage<PHDocument>;
  private idToDrive: ICacheStorage<DocumentDriveDocument>;
  private slugToDriveId: ICacheStorage<string>;

  constructor(private cache: ICacheStorage = new Map<string, unknown>()) {
    this.cacheStorageManager = new CacheStorageManager(cache);
    this.idToDocument = this.cacheStorageManager.createStorage<PHDocument>();
    this.idToDrive =
      this.cacheStorageManager.createStorage<DocumentDriveDocument>();
    this.slugToDriveId = this.cacheStorageManager.createStorage<string>();
  }

  clear() {
    this.idToDocument.clear();
    this.idToDrive.clear();
    this.slugToDriveId.clear();
  }

  /////////////////////////////////////////////////////////////////////////////
  // ICache
  /////////////////////////////////////////////////////////////////////////////

  async setDocument(documentId: string, document: PHDocument) {
    const doc = trimResultingState(document);
    this.idToDocument.set(documentId, doc);
  }

  async getDocument<TDocument extends PHDocument>(
    documentId: string,
  ): Promise<TDocument | undefined> {
    return this.idToDocument.get(documentId) as TDocument | undefined;
  }

  async deleteDocument(documentId: string) {
    return this.idToDocument.delete(documentId);
  }

  async setDrive(driveId: string, drive: DocumentDriveDocument) {
    const doc = trimResultingState(drive);
    this.idToDrive.set(driveId, doc);
  }

  async getDrive(driveId: string): Promise<DocumentDriveDocument | undefined> {
    return this.idToDrive.get(driveId);
  }

  async deleteDrive(driveId: string) {
    // look up the slug
    const drive = this.idToDrive.get(driveId);
    if (!drive) {
      return false;
    }

    const slug = drive.header.slug.length > 0 ? drive.header.slug : driveId;
    if (slug) {
      this.slugToDriveId.delete(slug);
    }

    return this.idToDrive.delete(driveId);
  }

  async setDriveBySlug(slug: string, drive: DocumentDriveDocument) {
    const driveId = drive.header.id;
    this.slugToDriveId.set(slug, driveId);
    this.setDrive(driveId, drive);
  }

  async getDriveBySlug(
    slug: string,
  ): Promise<DocumentDriveDocument | undefined> {
    const driveId = this.slugToDriveId.get(slug);
    if (!driveId) {
      return undefined;
    }
    return this.getDrive(driveId);
  }

  async deleteDriveBySlug(slug: string) {
    const driveId = this.slugToDriveId.get(slug);
    if (!driveId) {
      return false;
    }

    this.slugToDriveId.delete(slug);
    return this.deleteDrive(driveId);
  }
}

export default InMemoryCache;

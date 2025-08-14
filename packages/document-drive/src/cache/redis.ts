import { childLogger } from "#utils/logger";
import { type PHDocument } from "document-model";
import type { RedisClientType } from "redis";
import { type ICache } from "./types.js";
import { trimResultingState } from "./util.js";

class RedisCache implements ICache {
  private logger = childLogger(["RedisCache"]);

  private redis: RedisClientType;
  private timeoutInSeconds: number;

  constructor(
    redis: RedisClientType,
    timeoutInSeconds: number | undefined = 5 * 60,
  ) {
    this.redis = redis;
    this.timeoutInSeconds = timeoutInSeconds;
  }

  private static _getDocumentKey(documentId: string) {
    return `cache:document:${documentId}`;
  }

  /////////////////////////////////////////////////////////////////////////////
  // ICache
  /////////////////////////////////////////////////////////////////////////////

  async setDocument(documentId: string, document: PHDocument) {
    const doc = trimResultingState(document);
    const redisId = RedisCache._getDocumentKey(documentId);
    const result = await this.redis.set(redisId, JSON.stringify(doc), {
      EX: this.timeoutInSeconds ? this.timeoutInSeconds : undefined,
    });

    if (result !== "OK") {
      throw new Error(
        `Failed to set document ${documentId} in redis. Got '${result}'`,
      );
    }
  }

  async getDocument<TDocument extends PHDocument>(
    documentId: string,
  ): Promise<TDocument | undefined> {
    const redisId = RedisCache._getDocumentKey(documentId);
    const doc = await this.redis.get(redisId);

    return doc ? (JSON.parse(doc) as TDocument) : undefined;
  }

  async deleteDocument(documentId: string) {
    const redisId = RedisCache._getDocumentKey(documentId);
    return (await this.redis.del(redisId)) > 0;
  }
}

export default RedisCache;

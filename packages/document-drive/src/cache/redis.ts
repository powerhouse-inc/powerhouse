import { type PHDocument } from "document-model";
import type { RedisClientType } from "redis";
import { type ICache } from "./types.js";

class RedisCache implements ICache {
  private redis: RedisClientType;
  private timeoutInSeconds: number;

  constructor(
    redis: RedisClientType,
    timeoutInSeconds: number | undefined = 5 * 60,
  ) {
    this.redis = redis;
    this.timeoutInSeconds = timeoutInSeconds;
  }

  private static _getId(id: string) {
    return `cache:${id}`;
  }

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
    const redisId = RedisCache._getId(id);
    const result = await this.redis.set(redisId, JSON.stringify(doc), {
      EX: this.timeoutInSeconds ? this.timeoutInSeconds : undefined,
    });

    if (result === "OK") {
      return true;
    }

    return false;
  }

  async getDocument<TDocument extends PHDocument>(
    id: string,
  ): Promise<TDocument | undefined> {
    const redisId = RedisCache._getId(id);
    const doc = await this.redis.get(redisId);

    return doc ? (JSON.parse(doc) as TDocument) : undefined;
  }

  async deleteDocument(id: string) {
    const redisId = RedisCache._getId(id);
    return (await this.redis.del(redisId)) > 0;
  }
}

export default RedisCache;

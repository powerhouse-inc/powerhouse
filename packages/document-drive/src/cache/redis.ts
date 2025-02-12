import { BaseAction, BaseDocument } from "document-model";
import type { RedisClientType } from "redis";
import { ICache } from "./types.js";

class RedisCache<TGlobalState, TLocalState, TAction extends BaseAction>
  implements ICache<TGlobalState, TLocalState, TAction>
{
  private redis: RedisClientType;
  private timeoutInSeconds: number;

  constructor(
    redis: RedisClientType,
    timeoutInSeconds: number | undefined = 5 * 60,
  ) {
    this.redis = redis;
    this.timeoutInSeconds = timeoutInSeconds;
  }

  private static _getId(drive: string, id: string) {
    return `cache:${drive}:${id}`;
  }

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
    const redisId = RedisCache._getId(drive, id);
    const result = await this.redis.set(redisId, JSON.stringify(doc), {
      EX: this.timeoutInSeconds ? this.timeoutInSeconds : undefined,
    });

    if (result === "OK") {
      return true;
    }

    return false;
  }

  async getDocument(drive: string, id: string) {
    const redisId = RedisCache._getId(drive, id);
    const doc = await this.redis.get(redisId);

    return doc
      ? (JSON.parse(doc) as BaseDocument<TGlobalState, TLocalState, TAction>)
      : undefined;
  }

  async deleteDocument(drive: string, id: string) {
    const redisId = RedisCache._getId(drive, id);
    return (await this.redis.del(redisId)) > 0;
  }
}

export default RedisCache;

import { Document } from "document-model/document";
import { ICache } from "./types";
import type { RedisClientType } from "redis";

class RedisCache implements ICache {
    private redis: RedisClientType;
    private timeoutInSeconds: number;

    constructor(redis: RedisClientType, timeoutInSeconds: number | undefined = 5 * 60) {
        this.redis = redis;
        this.timeoutInSeconds = timeoutInSeconds;
    }

    private static _getId(drive: string, id: string) {
        return `${drive}:${id}`;
    }

    async setDocument(drive: string, id: string, document: Document) {
        const global = document.operations.global.map(e => {
            delete e.resultingState;
            return e;
        });
        const local = document.operations.local.map(e => {
            delete e.resultingState;
            return e;
        });
        const doc = { ...document, operations: { global, local } }
        const redisId = RedisCache._getId(drive, id);
        const result = await this.redis.set(redisId, JSON.stringify(doc), {
            EX: this.timeoutInSeconds ? this.timeoutInSeconds : undefined
        });

        if (result === 'OK') {
            return true;
        }

        return false;
    }

    async getDocument(drive: string, id: string) {
        const doc = await this.redis.hGet(drive, id);

        return doc ? JSON.parse(doc) as Document : undefined;
    }

    async deleteDocument(drive: string, id: string) {
        return (await this.redis.hDel(drive, id)) > 0;
    }
}

export default RedisCache;

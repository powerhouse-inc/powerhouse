import { Document } from "document-model/document";
import { ICache } from "./types";
import type { RedisClientType } from "redis";
import { logger } from "../utils/logger";

class RedisCache implements ICache {
    private redis: RedisClientType;

    constructor(redis: RedisClientType) {
        this.redis = redis;
        this.redis.flushAll().catch(logger.error);
    }

    async setDocument(drive: string, id: string, document: Document) {
        return (await this.redis.hSet(drive, id, JSON.stringify(document))) > 0;
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

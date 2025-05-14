import { type DocumentDriveDocument } from "#drive-document-model/gen/types";
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

  private static _getDriveKey(driveId: string) {
    return `cache:drive:${driveId}`;
  }

  private static _getDriveBySlugKey(slug: string) {
    return `cache:drive:slug:${slug}`;
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

  async setDrive(driveId: string, drive: DocumentDriveDocument) {
    const doc = trimResultingState(drive);
    const redisId = RedisCache._getDriveKey(driveId);
    const result = await this.redis.set(redisId, JSON.stringify(doc), {
      EX: this.timeoutInSeconds ? this.timeoutInSeconds : undefined,
    });

    if (result !== "OK") {
      throw new Error(
        `Failed to set drive ${driveId} in redis. Got '${result}'`,
      );
    }
  }

  async getDrive(driveId: string): Promise<DocumentDriveDocument | undefined> {
    const redisId = RedisCache._getDriveKey(driveId);
    const doc = await this.redis.get(redisId);
    return doc ? (JSON.parse(doc) as DocumentDriveDocument) : undefined;
  }

  async deleteDrive(driveId: string) {
    const redisId = RedisCache._getDriveKey(driveId);
    const drive = await this.getDrive(driveId);
    if (!drive) {
      return false;
    }

    if (drive.slug.length > 0) {
      const slugRedisId = RedisCache._getDriveBySlugKey(drive.slug);
      await this.redis.del(slugRedisId);
    }

    return (await this.redis.del(redisId)) > 0;
  }

  // We store two pices: slug -> driveId, and driveId -> drive
  async setDriveBySlug(slug: string, drive: DocumentDriveDocument) {
    const driveId = drive.id;
    const redisId = RedisCache._getDriveBySlugKey(slug);
    const result = await this.redis.set(redisId, driveId, {
      EX: this.timeoutInSeconds ? this.timeoutInSeconds : undefined,
    });

    if (result !== "OK") {
      throw new Error(
        `Failed to set drive slug mapping for ${slug} -> ${driveId} in redis. Got '${result}'`,
      );
    }

    await this.setDrive(driveId, drive);
  }

  async getDriveBySlug(
    slug: string,
  ): Promise<DocumentDriveDocument | undefined> {
    const redisId = RedisCache._getDriveBySlugKey(slug);
    const driveId = await this.redis.get(redisId);
    return driveId ? await this.getDrive(driveId) : undefined;
  }

  async deleteDriveBySlug(slug: string) {
    const redisId = RedisCache._getDriveBySlugKey(slug);
    return (await this.redis.del(redisId)) > 0;
  }
}

export default RedisCache;

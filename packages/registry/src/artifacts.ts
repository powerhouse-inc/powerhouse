// Where processed package versions live: unpacked files and piece bundles,
// written once by a worker and read by every replica.
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import { pacer } from "./pace.js";
import type { S3Config } from "./types.js";

export interface Artifact {
  stream: Readable;
  size?: number;
  /** The whole body, when it was held in memory. */
  body?: Buffer;
}

export interface ArtifactStore {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Uploads a file from disk; only large ones stream, since a stream can't be retried. */
  putFile(key: string, file: string, contentType: string): Promise<void>;
  get(key: string): Promise<Artifact | null>;
  deletePrefix(prefix: string): Promise<void>;
}

// The SDK can't replay a stream, so a throttled upload of one would fail at once
const BUFFERED_UPLOAD_BYTES = 4 * 1024 * 1024;
// Per process: a bucket's 750 requests per second is shared by every writer and
// reader on it, here dev and prod
const DEFAULT_WRITES_PER_SECOND = 150;

export function createS3ArtifactStore(config: S3Config): ArtifactStore {
  const paceWrite = pacer(
    config.maxWritesPerSecond ?? DEFAULT_WRITES_PER_SECOND,
  );
  const s3 = new S3Client({
    // Backs off when the provider answers SlowDown
    retryMode: "adaptive",
    maxAttempts: 5,
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.s3ForcePathStyle ?? true,
    // Checksums on every object cost CPU; S3 still gets them where required
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    // A hung request would hold a worker slot past its job lock
    requestHandler: {
      connectionTimeout: 5_000,
      requestTimeout: 60_000,
      httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 256 }),
      httpAgent: new http.Agent({ keepAlive: true, maxSockets: 256 }),
    },
    ...(config.accessKeyId && config.secretAccessKey
      ? {
          credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          },
        }
      : {}),
  });
  const root = `${config.keyPrefix ?? ""}artifacts/`;

  return {
    async put(key, body, contentType) {
      await paceWrite();
      await s3.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: root + key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },
    async putFile(key, file, contentType) {
      const { size } = await fs.promises.stat(file);
      if (size <= BUFFERED_UPLOAD_BYTES) {
        const body = await fs.promises.readFile(file);
        await paceWrite();
        await s3.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: root + key,
            Body: body,
            ContentLength: size,
            ContentType: contentType,
          }),
        );
        return;
      }
      const body = fs.createReadStream(file);
      // A send that fails before reading leaves the stream's errors unheard
      body.on("error", () => undefined);
      try {
        await paceWrite();
        await s3.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: root + key,
            Body: body,
            ContentLength: size,
            ContentType: contentType,
          }),
        );
      } finally {
        body.destroy();
      }
    },
    async get(key) {
      try {
        const res = await s3.send(
          new GetObjectCommand({ Bucket: config.bucket, Key: root + key }),
        );
        if (!res.Body) return null;
        return { stream: res.Body as Readable, size: res.ContentLength };
      } catch (err) {
        const name = (err as { name?: string }).name;
        if (name === "NoSuchKey" || name === "NotFound") return null;
        throw err;
      }
    },
    async deletePrefix(prefix) {
      let token: string | undefined;
      do {
        const listed = await s3.send(
          new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: root + prefix,
            ContinuationToken: token,
          }),
        );
        const keys = (listed.Contents ?? []).flatMap((o) =>
          o.Key ? [{ Key: o.Key }] : [],
        );
        if (keys.length > 0) {
          await paceWrite();
          await s3.send(
            new DeleteObjectsCommand({
              Bucket: config.bucket,
              Delete: { Objects: keys },
            }),
          );
        }
        token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
      } while (token);
    },
  };
}

export function createFsArtifactStore(rootDir: string): ArtifactStore {
  const root = path.resolve(rootDir);
  // Keys come from package contents; refuse any that climb out of the root
  const resolve = (key: string): string => {
    const file = path.resolve(root, key);
    if (!file.startsWith(root + path.sep)) {
      throw new Error(`artifact key escapes the store: ${key}`);
    }
    return file;
  };

  return {
    async put(key, body) {
      const file = resolve(key);
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
      await fs.promises.writeFile(tmp, body);
      await fs.promises.rename(tmp, file);
    },
    async putFile(key, source) {
      const file = resolve(key);
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
      await fs.promises.copyFile(source, tmp);
      await fs.promises.rename(tmp, file);
    },
    async get(key) {
      const file = resolve(key);
      try {
        const stat = await fs.promises.stat(file);
        if (!stat.isFile()) return null;
        return { stream: fs.createReadStream(file), size: stat.size };
      } catch {
        return null;
      }
    },
    async deletePrefix(prefix) {
      await fs.promises.rm(resolve(prefix), { recursive: true, force: true });
    },
  };
}

export interface CachedArtifactStore extends ArtifactStore {
  /** Drops cached entries under a key prefix, e.g. an unpublished version. */
  evictPrefix(prefix: string): void;
}

/**
 * Holds small artifacts in memory, least recently used out first. A key's
 * bytes never change once written, so an entry only goes when it's removed.
 */
export function withMemoryCache(
  store: ArtifactStore,
  { maxBytes, maxEntryBytes }: { maxBytes: number; maxEntryBytes: number },
): CachedArtifactStore {
  const entries = new Map<string, Buffer>();
  let total = 0;
  const drop = (key: string) => {
    const body = entries.get(key);
    if (!body) return;
    entries.delete(key);
    total -= body.length;
  };
  const hit = (body: Buffer): Artifact => ({
    body,
    size: body.length,
    get stream() {
      return Readable.from([body]);
    },
  });

  return {
    async put(key, body, contentType) {
      drop(key);
      await store.put(key, body, contentType);
    },
    async putFile(key, file, contentType) {
      drop(key);
      await store.putFile(key, file, contentType);
    },
    async get(key) {
      const cached = entries.get(key);
      if (cached) {
        entries.delete(key);
        entries.set(key, cached);
        return hit(cached);
      }
      const artifact = await store.get(key);
      if (
        !artifact ||
        artifact.size === undefined ||
        artifact.size > maxEntryBytes ||
        maxBytes <= 0
      ) {
        return artifact;
      }
      const body = await buffer(artifact.stream);
      entries.set(key, body);
      total += body.length;
      for (const oldest of entries.keys()) {
        if (total <= maxBytes) break;
        drop(oldest);
      }
      return hit(body);
    },
    async deletePrefix(prefix) {
      this.evictPrefix(prefix);
      await store.deletePrefix(prefix);
    },
    evictPrefix(prefix) {
      for (const key of [...entries.keys()]) {
        if (key.startsWith(prefix)) drop(key);
      }
    },
  };
}

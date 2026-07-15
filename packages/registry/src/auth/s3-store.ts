import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { S3Config } from "../types.js";

/** Minimal JSON object store over an S3 bucket. Keys are used as given by the
 *  caller (the caller owns any `<keyPrefix>` prefixing). A missing object
 *  (404 / NoSuchKey) is "absent", never an error. */
export interface S3ObjectStore {
  getJSON<T>(key: string): Promise<T | null>;
  putJSON(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

/** Just enough of the S3 client surface for the store — lets tests inject a
 *  fake without a network or the real SDK. */
export interface S3SendClient {
  send(command: unknown): Promise<unknown>;
}

/** Build a real S3 client from the same S3Config the aws-s3-storage store
 *  uses (mirrors verdaccio-config.ts store block). */
export function createS3Client(s3: S3Config): S3Client {
  return new S3Client({
    endpoint: s3.endpoint,
    region: s3.region,
    forcePathStyle: s3.s3ForcePathStyle ?? true,
    ...(s3.accessKeyId && s3.secretAccessKey
      ? {
          credentials: {
            accessKeyId: s3.accessKeyId,
            secretAccessKey: s3.secretAccessKey,
          },
        }
      : {}),
  });
}

function isNotFound(err: unknown): boolean {
  const e = err as
    | { name?: string; $metadata?: { httpStatusCode?: number } }
    | undefined;
  return (
    e?.name === "NoSuchKey" ||
    e?.name === "NotFound" ||
    e?.$metadata?.httpStatusCode === 404
  );
}

/** Read a JSON object body to a string across the SDK's Node/stream shapes. */
async function bodyToString(body: unknown): Promise<string> {
  const b = body as
    | { transformToString?: () => Promise<string> }
    | undefined
    | null;
  if (b && typeof b.transformToString === "function") {
    return b.transformToString();
  }
  // Fallback for non-standard bodies (e.g. test fakes returning a string).
  return typeof body === "string" ? body : "";
}

/**
 * JSON object store over S3. Pass a `client` to inject a fake in tests;
 * defaults to a real S3 client built from `s3`.
 */
export function createS3Store(
  s3: S3Config,
  client: S3SendClient = createS3Client(s3),
): S3ObjectStore {
  const Bucket = s3.bucket;
  return {
    async getJSON<T>(key: string): Promise<T | null> {
      try {
        const res = (await client.send(
          new GetObjectCommand({ Bucket, Key: key }),
        )) as { Body?: unknown };
        const text = await bodyToString(res.Body);
        return text ? (JSON.parse(text) as T) : null;
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
    async putJSON(key: string, value: unknown): Promise<void> {
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key: key,
          Body: JSON.stringify(value),
          ContentType: "application/json",
        }),
      );
    },
    async delete(key: string): Promise<void> {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
    async exists(key: string): Promise<boolean> {
      try {
        await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return true;
      } catch (err) {
        if (isNotFound(err)) return false;
        throw err;
      }
    },
  };
}

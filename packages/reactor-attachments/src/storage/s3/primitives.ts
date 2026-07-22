import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  AttachmentDownloadTarget,
  AttachmentUploadTarget,
} from "../../types.js";
import type { S3AttachmentConfig } from "./config.js";
import { deriveS3AttachmentKey, sha256HexToBase64 } from "./keying.js";

export interface S3CommandClient {
  send(command: object): Promise<unknown>;
}

export type S3Presigner = (
  client: object,
  command: object,
  expiresInSeconds: number,
) => Promise<string>;

type Dependencies = {
  client?: S3CommandClient;
  presign?: S3Presigner;
  now?: () => Date;
};

const defaultPresigner: S3Presigner = (client, command, expiresInSeconds) =>
  getSignedUrl(client as S3Client, command as never, {
    expiresIn: expiresInSeconds,
    unhoistableHeaders: new Set(["x-amz-checksum-sha256"]),
  });

export class S3AttachmentPrimitives {
  readonly client: S3CommandClient;
  readonly presign: S3Presigner;
  readonly now: () => Date;

  constructor(
    readonly config: S3AttachmentConfig,
    dependencies: Dependencies = {},
  ) {
    this.client =
      dependencies.client ??
      new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        forcePathStyle: config.forcePathStyle,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
    this.presign = dependencies.presign ?? defaultPresigner;
    this.now = dependencies.now ?? (() => new Date());
  }

  buildHeadObjectCommand(hash: string): object {
    return new HeadObjectCommand({
      Bucket: this.config.bucket,
      Key: deriveS3AttachmentKey(hash, this.config.prefix),
    });
  }

  buildPutObjectCommand(hash: string, mimeType: string): object {
    if (
      mimeType.trim().length === 0 ||
      mimeType.includes("\r") ||
      mimeType.includes("\n")
    ) {
      throw new Error(
        "Attachment MIME type must not be blank or contain newlines",
      );
    }
    return new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: deriveS3AttachmentKey(hash, this.config.prefix),
      ContentType: mimeType,
      ChecksumSHA256: sha256HexToBase64(hash),
    });
  }

  buildGetObjectCommand(hash: string): object {
    return new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: deriveS3AttachmentKey(hash, this.config.prefix),
    });
  }

  headObject(hash: string): Promise<unknown> {
    return this.client.send(this.buildHeadObjectCommand(hash));
  }

  async createUploadTarget(
    hash: string,
    mimeType: string,
    ttlSeconds = this.config.uploadTtlSeconds,
  ): Promise<AttachmentUploadTarget> {
    const checksum = sha256HexToBase64(hash);
    const url = await this.presign(
      this.client,
      this.buildPutObjectCommand(hash, mimeType),
      ttlSeconds,
    );
    return {
      kind: "presigned-put",
      method: "PUT",
      url,
      headers: {
        "content-type": mimeType,
        "x-amz-checksum-sha256": checksum,
      },
      expiresAtUtc: new Date(
        this.now().getTime() + ttlSeconds * 1_000,
      ).toISOString(),
    };
  }

  async createDownloadTarget(
    hash: string,
    ttlSeconds = this.config.downloadTtlSeconds,
  ): Promise<AttachmentDownloadTarget> {
    const url = await this.presign(
      this.client,
      this.buildGetObjectCommand(hash),
      ttlSeconds,
    );
    return {
      kind: "presigned-get",
      method: "GET",
      url,
      headers: {},
      expiresAtUtc: new Date(
        this.now().getTime() + ttlSeconds * 1_000,
      ).toISOString(),
    };
  }
}

export function createS3AttachmentPrimitives(
  config: S3AttachmentConfig,
  dependencies: Dependencies = {},
): S3AttachmentPrimitives {
  return new S3AttachmentPrimitives(config, dependencies);
}
